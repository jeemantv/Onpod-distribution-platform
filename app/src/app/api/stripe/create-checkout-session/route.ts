import { NextResponse } from "next/server";

// TODO: spec §13.2 — create Stripe customer if needed, create Checkout session, return url.
export async function POST(req: Request) {
  const { priceId } = (await req.json()) as { priceId: string };
  return NextResponse.json({
    url: `https://checkout.stripe.com/c/mock/${priceId}`,
  });
}
