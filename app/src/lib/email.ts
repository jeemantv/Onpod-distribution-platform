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

/** First-time invite — new client created in the system (e.g. by n8n
 *  when a booking email comes in, or by an admin via the Clients page).
 *  Branded with the OnPod gradient and friendly copy. */
export function welcomeMagicLinkEmail(args: {
  firstName: string;
  signInUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = "Welcome to OnPod — your files are ready";
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #0a0a0b; color: #fafafa;">
      <h1 style="font-size: 24px; background: linear-gradient(135deg,#a855f7,#ec4899); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; margin: 0 0 16px;">ONPOD</h1>
      <p style="margin: 0 0 12px;">Hi ${args.firstName || "there"},</p>
      <p style="margin: 0 0 12px;">Your studio session is in the system. Click the button below to access your files — no password needed.</p>
      <p style="margin: 24px 0;">
        <a href="${args.signInUrl}" style="display: inline-block; background: #ff3b30; color: white; padding: 12px 22px; border-radius: 10px; text-decoration: none; font-weight: 600;">
          Open OnPod
        </a>
      </p>
      <p style="color: #888; font-size: 12px;">This link expires in 30 minutes. Need another? Visit <a href="https://onpod.vercel.app/login" style="color: #c084fc;">onpod.vercel.app/login</a> and enter your email.</p>
    </div>
  `;
  const text = `Welcome to OnPod\n\nHi ${args.firstName || "there"},\n\nYour studio session is in the system. Open OnPod (no password needed):\n${args.signInUrl}\n\nThis link expires in 30 minutes.`;
  return { subject, html, text };
}

/** Returning-user sign-in. Same shape as the invite but lighter copy. */
export function magicLinkEmail(args: {
  firstName: string;
  signInUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = "Sign in to OnPod";
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; background: #0a0a0b; color: #fafafa;">
      <h1 style="font-size: 24px; background: linear-gradient(135deg,#a855f7,#ec4899); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; margin: 0 0 16px;">ONPOD</h1>
      <p style="margin: 0 0 12px;">Hi ${args.firstName || "there"},</p>
      <p style="margin: 0 0 12px;">Click below to sign in. The link works once and expires in 30 minutes.</p>
      <p style="margin: 24px 0;">
        <a href="${args.signInUrl}" style="display: inline-block; background: #ff3b30; color: white; padding: 12px 22px; border-radius: 10px; text-decoration: none; font-weight: 600;">
          Sign in to OnPod
        </a>
      </p>
      <p style="color: #888; font-size: 12px;">Didn't request this? You can safely ignore the email.</p>
    </div>
  `;
  const text = `Sign in to OnPod\n\nHi ${args.firstName || "there"},\n\nClick to sign in (expires in 30 minutes):\n${args.signInUrl}\n\nDidn't request this? Ignore this email.`;
  return { subject, html, text };
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
