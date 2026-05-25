// Opens the Stripe Customer Portal for the logged-in user. Lets them
// change card, switch plan, cancel — all UI is hosted by Stripe.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getUserByEmail } from "@/lib/auth-store";
import { stripe, siteOrigin, StripeNotConfiguredError } from "@/lib/stripe";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: Request) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const stored = await getUserByEmail(session.email);
  if (!stored) {
    return NextResponse.json({ error: "user_missing" }, { status: 404 });
  }
  const [row] = await db.select().from(users).where(eq(users.id, stored.id)).limit(1);
  if (!row?.stripeCustomerId) {
    return NextResponse.json(
      {
        error: "no_customer",
        message: "Subscribe to a plan before opening the billing portal.",
      },
      { status: 400 },
    );
  }

  try {
    const portal = await stripe().billingPortal.sessions.create({
      customer: row.stripeCustomerId,
      return_url: `${siteOrigin(req)}/settings/billing`,
    });
    return NextResponse.json({ ok: true, url: portal.url });
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) {
      return NextResponse.json(
        { error: "stripe_not_configured", message: err.message },
        { status: 503 },
      );
    }
    console.error("[stripe/portal]", err);
    return NextResponse.json(
      { error: "portal_error", message: (err as Error).message },
      { status: 500 },
    );
  }
}
