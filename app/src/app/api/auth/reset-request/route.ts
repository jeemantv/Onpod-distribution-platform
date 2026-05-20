import { NextResponse } from "next/server";
import { createResetToken, getUserByEmail } from "@/lib/auth-store";
import { passwordResetEmail, sendEmail } from "@/lib/email";

export async function POST(req: Request) {
  const { email } = (await req.json()) as { email?: string };
  if (!email) {
    return NextResponse.json({ error: "missing_email" }, { status: 400 });
  }
  // Always return ok to avoid leaking which emails exist.
  const user = await getUserByEmail(email);
  if (!user) {
    return NextResponse.json({ ok: true });
  }

  const token = await createResetToken(user.id, user.email);
  const origin =
    process.env.NEXTAUTH_URL ?? new URL(req.url).origin;
  const resetUrl = `${origin}/reset?token=${encodeURIComponent(token)}`;
  const tmpl = passwordResetEmail({ firstName: user.firstName, resetUrl });
  try {
    await sendEmail({
      to: user.email,
      subject: tmpl.subject,
      html: tmpl.html,
      text: tmpl.text,
    });
  } catch (err) {
    console.error("[reset-request] email failed", err);
  }
  return NextResponse.json({ ok: true });
}
