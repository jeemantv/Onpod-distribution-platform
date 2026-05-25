// Feature request / feedback intake. Any signed-in user can submit;
// message gets emailed to jeremy@jeeman.tv via Resend. Designed to be
// low-friction — no triage UI, no DB row, just a fire-and-forget email.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { sendEmail } from "@/lib/email";

const FEEDBACK_TO = "jeremy@jeeman.tv";
const MAX_MESSAGE = 5000;

interface Body {
  message: string;
  page?: string;
  kind?: "feature" | "bug" | "other";
}

export async function POST(req: Request) {
  const user = getSession();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Body | null;
  const message = body?.message?.trim();
  if (!message) {
    return NextResponse.json({ error: "missing_message" }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE) {
    return NextResponse.json(
      { error: "too_long", message: `Max ${MAX_MESSAGE} characters.` },
      { status: 400 },
    );
  }
  const page = body?.page?.slice(0, 200) ?? "(unknown)";
  const kind = body?.kind ?? "feature";

  const fullName =
    `${user.firstName} ${user.lastName}`.trim() || user.email;
  const subject = `[OnPod ${kind}] ${fullName} via ${page}`;
  const text = [
    `From: ${fullName} <${user.email}>`,
    `Role: ${user.role}`,
    `Plan: ${user.plan}`,
    `Page: ${page}`,
    `Kind: ${kind}`,
    "",
    "Message:",
    message,
  ].join("\n");
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <h2 style="font-size:18px;margin:0 0 12px;">${escapeHtml(subject)}</h2>
      <table style="border-collapse:collapse;font-size:12px;color:#666;margin-bottom:16px;">
        <tr><td style="padding:2px 8px 2px 0;">From:</td><td>${escapeHtml(fullName)} &lt;${escapeHtml(user.email)}&gt;</td></tr>
        <tr><td style="padding:2px 8px 2px 0;">Role:</td><td>${escapeHtml(user.role)}</td></tr>
        <tr><td style="padding:2px 8px 2px 0;">Plan:</td><td>${escapeHtml(user.plan)}</td></tr>
        <tr><td style="padding:2px 8px 2px 0;">Page:</td><td>${escapeHtml(page)}</td></tr>
        <tr><td style="padding:2px 8px 2px 0;">Kind:</td><td>${escapeHtml(kind)}</td></tr>
      </table>
      <div style="background:#f5f5f5;padding:14px 16px;border-radius:8px;white-space:pre-wrap;font-size:13px;line-height:1.55;">${escapeHtml(message)}</div>
    </div>
  `;

  let sent = false;
  let sendError: string | undefined;
  try {
    await sendEmail({ to: FEEDBACK_TO, subject, html, text });
    sent = true;
  } catch (err) {
    sendError = (err as Error).message;
    console.error("[feedback] send failed", { sendError });
  }

  return NextResponse.json({ ok: true, sent, sendError });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
