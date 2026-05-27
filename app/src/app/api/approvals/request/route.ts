// Send an approval-request email via Resend. The email lists ONLY the
// files the editor picked (no implicit "all unapproved" fallback) — the
// caller side enforces that.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { sendEmail } from "@/lib/email";

interface RequestBody {
  projectId: string;
  to: string;
  subject: string;
  body: string;
  fileNames?: string[];
}

export async function POST(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "admin" && user.role !== "editor") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as RequestBody | null;
  if (!body?.to || !body?.subject || !body?.body) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const safeTo = body.to.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(safeTo)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  // The body sent by the modal is already plaintext-formatted with file
  // names + the share URL. Render it as a minimal branded HTML so it
  // looks the same as our other transactional emails.
  const escaped = body.body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const linkified = escaped.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" style="color:#c084fc;">$1</a>',
  );
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#0a0a0b;color:#fafafa;">
      <h1 style="font-size:22px;background:linear-gradient(135deg,#a855f7,#ec4899);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin:0 0 16px;">ONPOD</h1>
      <pre style="font-family:inherit;font-size:13px;line-height:1.6;white-space:pre-wrap;margin:0;">${linkified}</pre>
    </div>
  `;

  try {
    await sendEmail({
      to: safeTo,
      subject: body.subject,
      html,
      text: body.body,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "email_failed", message: (err as Error).message },
      { status: 502 },
    );
  }
  return NextResponse.json({
    sent: true,
    to: safeTo,
    fileCount: body.fileNames?.length ?? 0,
  });
}
