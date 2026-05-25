// Creates a Stripe Checkout Session for the logged-in user + selected
// plan. Returns the session URL — caller redirects there. Reuses an
// existing Stripe Customer if the user already has one (so subsequent
// charges land on the same payment method / invoice history).

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getUserByEmail, updateUserStripe } from "@/lib/auth-store";
import {
  StripeNotConfiguredError,
  priceIdForPlan,
  siteOrigin,
  stripe,
} from "@/lib/stripe";
import type { Plan } from "@/lib/types";

export async function POST(req: Request) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { plan?: Plan } | null;
  const plan = body?.plan;
  if (!plan) {
    return NextResponse.json({ error: "missing_plan" }, { status: 400 });
  }
  const priceId = priceIdForPlan(plan);
  if (!priceId) {
    return NextResponse.json(
      {
        error: "plan_not_billable",
        message: `No Stripe price configured for plan "${plan}". Set STRIPE_PRICE_${plan.toUpperCase()} in Vercel env.`,
      },
      { status: 400 },
    );
  }

  const stored = await getUserByEmail(session.email);
  if (!stored) {
    return NextResponse.json({ error: "user_missing" }, { status: 404 });
  }

  try {
    const client = stripe();
    // Reuse the existing Customer if we already minted one. Otherwise
    // create on-the-fly and persist the id so portal + future checkouts
    // use the same customer record.
    const userRow = await import("@/lib/db").then(async ({ db }) => {
      const { users } = await import("@/lib/db/schema");
      const { eq } = await import("drizzle-orm");
      const [u] = await db.select().from(users).where(eq(users.id, stored.id)).limit(1);
      return u;
    });
    let customerId = userRow?.stripeCustomerId ?? null;
    if (!customerId) {
      const created = await client.customers.create({
        email: stored.email,
        name: `${stored.firstName} ${stored.lastName}`.trim() || stored.email,
        metadata: { userId: stored.id },
      });
      customerId = created.id;
      await updateUserStripe(stored.id, { stripeCustomerId: customerId });
    }

    const origin = siteOrigin(req);
    const checkout = await client.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      // Carry the plan through to the webhook so we can map session ->
      // user.plan without another roundtrip.
      metadata: { userId: stored.id, plan },
      subscription_data: { metadata: { userId: stored.id, plan } },
      success_url: `${origin}/settings/billing?session_id={CHECKOUT_SESSION_ID}&status=success`,
      cancel_url: `${origin}/settings/billing?status=cancelled`,
      allow_promotion_codes: true,
    });

    return NextResponse.json({ ok: true, url: checkout.url });
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) {
      return NextResponse.json(
        { error: "stripe_not_configured", message: err.message },
        { status: 503 },
      );
    }
    console.error("[stripe/checkout]", err);
    return NextResponse.json(
      { error: "stripe_error", message: (err as Error).message },
      { status: 500 },
    );
  }
}
