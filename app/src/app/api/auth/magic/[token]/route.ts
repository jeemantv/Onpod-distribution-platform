// Consume a magic-link token. Single-use: even on success the token is
// deleted. On failure (bad token, expired) the user lands on /login
// with an error flag — better than a JSON dead-end.

import { NextResponse } from "next/server";
import { consumeMagicToken } from "@/lib/magic-link";
import { getUserByEmail } from "@/lib/auth-store";
import { setSession } from "@/lib/session";

function loginUrlWithError(req: Request, reason: string): NextResponse {
  const url = new URL("/login", new URL(req.url).origin);
  url.searchParams.set("magic", reason);
  return NextResponse.redirect(url);
}

export async function GET(
  req: Request,
  { params }: { params: { token: string } },
) {
  const token = decodeURIComponent(params.token ?? "");
  if (!token) return loginUrlWithError(req, "missing");

  const email = await consumeMagicToken(token);
  if (!email) return loginUrlWithError(req, "expired");

  const user = await getUserByEmail(email);
  if (!user) return loginUrlWithError(req, "missing_user");

  // Issue the same session cookie the password flow produces.
  setSession({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    avatar: user.avatar,
    avatarColor: user.avatarColor,
    role: user.role,
    // plan not on StoredUser — fall back to default. (Auth.js phase will
    // hydrate this from the DB instead.)
  });

  const landing = new URL(
    user.role === "admin" || user.role === "editor" ? "/admin/clients" : "/account",
    new URL(req.url).origin,
  );
  return NextResponse.redirect(landing);
}
