import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { buildAuthUrl, isConfigured } from "@/lib/youtube";
import { getSession } from "@/lib/session";

export async function GET(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  if (!isConfigured()) {
    return NextResponse.redirect(
      new URL("/settings?youtube=not_configured", req.url),
    );
  }

  const returnTo = new URL(req.url).searchParams.get("returnTo") ?? "/account";
  const state = `${user.id}::${Buffer.from(returnTo, "utf8").toString("base64url")}::${Math.random().toString(36).slice(2)}`;

  cookies().set("yt_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return NextResponse.redirect(buildAuthUrl(state));
}
