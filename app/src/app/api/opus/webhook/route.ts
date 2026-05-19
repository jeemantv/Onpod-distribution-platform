import { NextResponse } from "next/server";

// TODO: spec §9.2 — download each clip from OpusClip CDN, upload to B2, create files rows, notify.
export async function POST(req: Request) {
  const body = (await req.json()) as Record<string, unknown>;
  console.log("[opus webhook] received", body);
  return NextResponse.json({ received: true });
}
