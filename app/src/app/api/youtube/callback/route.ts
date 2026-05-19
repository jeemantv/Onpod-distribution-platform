import { NextResponse } from "next/server";

// TODO: spec §7.2 — exchange OAuth code, save tokens to youtube_credentials, fetch channel info.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  void code;
  return NextResponse.redirect(new URL("/settings?youtube=connected", req.url));
}
