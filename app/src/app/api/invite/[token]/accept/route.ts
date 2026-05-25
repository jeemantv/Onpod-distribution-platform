// Public studio-invite acceptance. Anyone with a valid token can sign
// up as a client of that studio. Creates the user, attaches them to
// the studio (homeStudio, selfUploadEnabled=true for externals), and
// sends them a magic link via Resend. Token usage is recorded but the
// invite is NOT single-use — many clients can sign up via the same
// share link.

import { NextResponse } from "next/server";
import {
  getStudioInviteByToken,
  getStudio,
  recordStudioInviteUse,
} from "@/lib/studio-registry";
import {
  getUserByEmail,
  createUser,
  updateUserHomeStudio,
  updateUserSelfUpload,
} from "@/lib/auth-store";
import { issueMagicToken, buildMagicLinkUrl } from "@/lib/magic-link";
import { sendEmail, welcomeMagicLinkEmail } from "@/lib/email";

function siteOrigin(req: Request): string {
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return new URL(req.url).origin;
}

export async function POST(
  req: Request,
  { params }: { params: { token: string } },
) {
  const invite = await getStudioInviteByToken(params.token);
  if (!invite) {
    return NextResponse.json(
      { error: "invalid_invite", message: "This invite link is invalid or revoked." },
      { status: 404 },
    );
  }
  const studio = await getStudio(invite.studioSlug);
  if (!studio) {
    return NextResponse.json(
      { error: "studio_missing", message: "That studio no longer exists." },
      { status: 410 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    email?: string;
    firstName?: string;
    lastName?: string;
  } | null;
  const email = body?.email?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  const firstName = body?.firstName?.trim() || email.split("@")[0];
  const lastName = body?.lastName?.trim() || "";

  let user = await getUserByEmail(email);
  let created = false;
  if (!user) {
    const placeholder = `m_${Math.random().toString(36).slice(2, 18)}`;
    user = await createUser({
      email,
      password: placeholder,
      firstName,
      lastName,
      role: "client",
    });
    created = true;
  }

  await updateUserHomeStudio(user.id, invite.studioSlug).catch(() => undefined);
  await updateUserSelfUpload(user.id, true).catch(() => undefined);

  const { token } = await issueMagicToken(email);
  const signInUrl = buildMagicLinkUrl(siteOrigin(req), token);
  const tmpl = welcomeMagicLinkEmail({ firstName: user.firstName, signInUrl });
  let sent = false;
  let sendError: string | undefined;
  try {
    await sendEmail({ to: email, subject: tmpl.subject, html: tmpl.html, text: tmpl.text });
    sent = true;
  } catch (err) {
    sendError = (err as Error).message;
    console.error("[invite/accept] email send failed", { email, sendError });
  }

  await recordStudioInviteUse(invite.id).catch(() => undefined);

  return NextResponse.json({
    ok: true,
    created,
    sent,
    sendError,
    studio: {
      slug: studio.slug,
      displayName: studio.displayName,
      paymentLinkUrl: studio.paymentLinkUrl,
    },
    // Surface dev link when the email didn't actually go out (no key
    // configured OR Resend rejected the send).
    devLink: !process.env.RESEND_API_KEY || !sent ? signInUrl : undefined,
  });
}
