import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCodeForTokens, listMyChannels } from "@/lib/youtube";
import { addChannelConnection } from "@/lib/youtube-store";
import { getSession } from "@/lib/session";

export async function GET(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/account?youtube_error=${encodeURIComponent(error)}`, req.url),
    );
  }
  if (!code || !state) {
    return NextResponse.redirect(new URL("/account?youtube_error=missing", req.url));
  }

  const cookieState = cookies().get("yt_oauth_state")?.value;
  if (!cookieState || cookieState !== state) {
    return NextResponse.redirect(
      new URL("/account?youtube_error=state_mismatch", req.url),
    );
  }
  cookies().delete("yt_oauth_state");

  const [stateUserId, returnB64] = state.split("::");
  if (stateUserId !== user.id) {
    return NextResponse.redirect(
      new URL("/account?youtube_error=user_mismatch", req.url),
    );
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const channels = await listMyChannels(tokens.accessToken);
    if (channels.length === 0) {
      return NextResponse.redirect(
        new URL("/account?youtube_error=no_channels", req.url),
      );
    }
    // Merge into any already-connected channels (don't drop them); the channel
    // just authorized becomes the active one.
    await addChannelConnection(user.id, channels, tokens, Date.now());
  } catch (err) {
    console.error("[youtube callback]", err);
    return NextResponse.redirect(
      new URL(
        `/account?youtube_error=${encodeURIComponent((err as Error).message.slice(0, 200))}`,
        req.url,
      ),
    );
  }

  const returnTo = returnB64
    ? Buffer.from(returnB64, "base64url").toString("utf8")
    : "/account";
  return NextResponse.redirect(new URL(returnTo, req.url));
}
