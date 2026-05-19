import { NextResponse } from "next/server";

// TODO: spec §13.3 — verify Stripe signature, dispatch event handlers.
//   checkout.session.completed         → update plan, store subscriptionId
//   customer.subscription.updated      → update plan, reset credits if renewal
//   customer.subscription.deleted      → downgrade or suspend
//   invoice.payment_failed             → notify user; suspend after 3 fails
//   invoice.payment_succeeded          → reset monthly credits
export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  console.log("[stripe webhook] sig", sig);
  return NextResponse.json({ received: true });
}
