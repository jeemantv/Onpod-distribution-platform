// Returning-user magic-link request. Anyone can call with their email;
// we don't leak whether the email exists (always returns 200). If it
// does exist, we issue a token + email it. If it doesn't, we still
// respond as if it succeeded.

import { NextResponse } from "next/server";
import { getUserByEmail } from "@/lib/auth-store";
import { issueMagicToken, buildMagicLinkUrl } from "@/lib/magic-link";
import { sendEmail, magicLinkEmail } from "@/lib/email";

function siteOrigin(req: Request): string {
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return new URL(req.url).origin;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { email?: string } | null;
  const email = body?.email?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  const user = await getUserByEmail(email);
  if (!user) {
    // Don't enumerate. Pretend it worked.
    return NextResponse.json({ ok: true });
  }

  const { token } = await issueMagicToken(email);
  const signInUrl = buildMagicLinkUrl(siteOrigin(req), token);
  const tmpl = magicLinkEmail({ firstName: user.firstName, signInUrl });
  let sent = false;
  try {
    await sendEmail({ to: email, subject: tmpl.subject, html: tmpl.html, text: tmpl.text });
    sent = true;
  } catch (err) {
    console.error("[auth/magic/request] email send failed", (err as Error).message);
  }

  return NextResponse.json({
    ok: true,
    // Same fallback rule as the invite route — surface the link if send
    // failed so the requester can copy it from the login page.
    devLink: !process.env.RESEND_API_KEY || !sent ? signInUrl : undefined,
  });
}
