// Admin-only test send. Fires a small branded "this is a test from
// OnPod" email through the same Resend pipeline the real flows use.
// Surfaces the exact failure reason when Resend rejects (no key, domain
// unverified, sandbox restriction, etc.) so admins can diagnose without
// digging through Vercel logs.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { sendEmail } from "@/lib/email";

export const maxDuration = 30;

export async function POST(req: Request) {
  requireAdmin();
  const body = (await req.json().catch(() => ({}))) as { to?: string };
  const to = body.to?.trim().toLowerCase();
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return NextResponse.json(
      { error: "invalid_email", message: "Pass a valid `to` address." },
      { status: 400 },
    );
  }
  const subject = "OnPod test email";
  const sentAt = new Date().toUTCString();
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0a0a0b;color:#fafafa;">
      <h1 style="font-size:22px;background:linear-gradient(135deg,#a855f7,#ec4899);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin:0 0 12px;">ONPOD</h1>
      <p style="margin:0 0 8px;">This is a test send from OnPod's admin panel.</p>
      <p style="margin:0 0 8px;color:#6b6b73;font-size:12px;">Sent at ${sentAt}</p>
      <p style="margin:0;color:#6b6b73;font-size:12px;">If you got this, Resend is delivering to <code>${to}</code>.</p>
    </div>
  `;
  const text = `OnPod test email\n\nThis is a test send from OnPod's admin panel.\nSent at ${sentAt}.\n\nIf you got this, Resend is delivering to ${to}.`;
  const hasKey = !!process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "OnPod <hi@onpod.io>";
  try {
    await sendEmail({ to, subject, html, text });
    return NextResponse.json({
      ok: true,
      to,
      from: fromEmail,
      sandboxMode: !hasKey,
      message: hasKey
        ? `Sent via Resend. If it doesn't land in the inbox within ~30s, check spam, or verify ${to} is allowed by the sender domain.`
        : "RESEND_API_KEY isn't set, so the send was logged to the server console instead of actually emailed. Add the key + verify your domain in Vercel env to deliver for real.",
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        to,
        from: fromEmail,
        error: "send_failed",
        message: (err as Error).message,
      },
      { status: 502 },
    );
  }
}
