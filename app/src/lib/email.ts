// Email sender via Resend. Falls back to console.log when RESEND_API_KEY
// isn't configured so dev / staging flows still surface the link.

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.RESEND_FROM_EMAIL || "OnPod <hi@onpod.io>";

  if (!apiKey) {
    console.log(
      `[email] (no RESEND_API_KEY) would send to ${input.to}: ${input.subject}\n${input.text ?? input.html}`,
    );
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${body.slice(0, 300)}`);
  }
}

export function passwordResetEmail(args: {
  firstName: string;
  resetUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = "Reset your OnPod password";
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h1 style="font-size: 22px;">Reset your password</h1>
      <p>Hi ${args.firstName || "there"},</p>
      <p>Click the link below to set a new password. It expires in 1 hour.</p>
      <p style="margin: 24px 0;">
        <a href="${args.resetUrl}" style="background: #ff3b30; color: white; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          Reset password
        </a>
      </p>
      <p style="color: #6b6b73; font-size: 12px;">If you didn't request this, you can ignore this email.</p>
    </div>
  `;
  const text = `Reset your OnPod password\n\nHi ${args.firstName || "there"},\n\nClick this link to set a new password (expires in 1 hour):\n${args.resetUrl}\n\nIf you didn't request this, ignore this email.`;
  return { subject, html, text };
}
