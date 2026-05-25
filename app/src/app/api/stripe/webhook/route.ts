// Stripe webhook receiver. Validates the signature, then maps events
// to user.plan + stripe linkage updates.
//
// Configure in Stripe Dashboard:
//   - Endpoint URL: https://onpod.vercel.app/api/stripe/webhook
//   - Events: checkout.session.completed, customer.subscription.updated,
//             customer.subscription.deleted
//   - Copy the signing secret into STRIPE_WEBHOOK_SECRET.

import { NextResponse } from "next/server";
import Stripe from "stripe";
import {
  getUserByEmail,
  getUserByStripeCustomerId,
  updateUserPlan,
  updateUserStripe,
} from "@/lib/auth-store";
import { stripe, StripeNotConfiguredError } from "@/lib/stripe";
import { PLAN_LIMITS, type Plan } from "@/lib/types";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

export const runtime = "nodejs";

function planFromMetadata(metadata: Stripe.Metadata | null | undefined): Plan | null {
  // Stripe Checkout uses `plan`; Payment Links (created via API with our
  // plan slug) write `onpod_plan_slug`. Either works.
  const candidate = metadata?.plan ?? metadata?.onpod_plan_slug;
  if (!candidate) return null;
  return candidate in PLAN_LIMITS ? (candidate as Plan) : null;
}

export async function POST(req: Request) {
  if (!WEBHOOK_SECRET) {
    return NextResponse.json(
      {
        error: "webhook_not_configured",
        message: "Set STRIPE_WEBHOOK_SECRET in Vercel env.",
      },
      { status: 503 },
    );
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;
  let client: Stripe;
  try {
    client = stripe();
    event = client.webhooks.constructEvent(body, sig, WEBHOOK_SECRET);
  } catch (err) {
    if (err instanceof StripeNotConfiguredError) {
      return NextResponse.json(
        { error: "stripe_not_configured" },
        { status: 503 },
      );
    }
    console.error("[stripe/webhook] signature verification failed", err);
    return NextResponse.json(
      { error: "invalid_signature", message: (err as Error).message },
      { status: 400 },
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        // Merge metadata from both the session and (if it exists) the
        // subscription. Stripe Payment Links sometimes only stamp our
        // `onpod_plan_slug` on `subscription_data.metadata`, which lands
        // on the subscription object, not on the session itself.
        const customerId =
          typeof session.customer === "string" ? session.customer : session.customer?.id;
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        let plan = planFromMetadata(session.metadata);
        if (!plan && subscriptionId) {
          const sub = await client.subscriptions.retrieve(subscriptionId);
          plan = planFromMetadata(sub.metadata);
        }
        const userId = session.metadata?.userId;
        const customerEmail =
          session.customer_details?.email ?? session.customer_email ?? null;

        if (userId && plan) {
          await updateUserPlan(userId, plan).catch((e) =>
            console.warn("[stripe/webhook] plan update failed", e),
          );
          if (customerId || subscriptionId) {
            await updateUserStripe(userId, {
              stripeCustomerId: customerId ?? undefined,
              stripeSubscriptionId: subscriptionId ?? undefined,
            }).catch((e) => console.warn("[stripe/webhook] stripe linkage failed", e));
          }
        } else if (plan && (customerId || customerEmail)) {
          // Payment-link path: no userId metadata since the link was
          // generated server-side without binding to a user. Match by
          // existing Stripe customer ID first; otherwise by email.
          let target = customerId
            ? await getUserByStripeCustomerId(customerId)
            : null;
          if (!target && customerEmail) {
            target = await getUserByEmail(customerEmail);
          }
          if (target) {
            await updateUserPlan(target.id, plan);
            if (customerId || subscriptionId) {
              await updateUserStripe(target.id, {
                stripeCustomerId: customerId ?? undefined,
                stripeSubscriptionId: subscriptionId ?? undefined,
              });
            }
          } else {
            console.warn(
              "[stripe/webhook] payment-link checkout with no matching user",
              { customerId, customerEmail, plan },
            );
          }
        }
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const plan = planFromMetadata(sub.metadata);
        const customerId =
          typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const user = await getUserByStripeCustomerId(customerId);
        if (user && plan) {
          await updateUserPlan(user.id, plan);
          await updateUserStripe(user.id, { stripeSubscriptionId: sub.id });
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId =
          typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const user = await getUserByStripeCustomerId(customerId);
        if (user) {
          await updateUserPlan(user.id, "free");
          await updateUserStripe(user.id, { stripeSubscriptionId: null });
        }
        break;
      }
      default:
        // Ignore unhandled events. Stripe expects 2xx so they don't retry.
        break;
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[stripe/webhook] handler error", err);
    return NextResponse.json(
      { error: "handler_error", message: (err as Error).message },
      { status: 500 },
    );
  }
}
