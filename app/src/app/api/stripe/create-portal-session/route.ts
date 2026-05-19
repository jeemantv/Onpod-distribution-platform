import { NextResponse } from "next/server";

// TODO: spec §13.4 — create Stripe customer-portal session.
export async function POST() {
  return NextResponse.json({
    url: "https://billing.stripe.com/p/mock-session",
  });
}
