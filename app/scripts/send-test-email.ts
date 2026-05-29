// CLI test send. Fires through the same Resend pipeline as production.
//
//   npx tsx scripts/send-test-email.ts <to-email>
//
// Falls back to console output when RESEND_API_KEY isn't set.

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: false });

import { sendEmail } from "@/lib/email";

const to = process.argv[2];
if (!to) {
  console.error("Usage: npx tsx scripts/send-test-email.ts <to-email>");
  process.exit(1);
}

const main = async () => {
  const sentAt = new Date().toUTCString();
  const subject = "OnPod test email";
  const html = `<p>Test send from the OnPod CLI.</p><p style="color:#888;font-size:12px;">Sent at ${sentAt}</p>`;
  const text = `Test send from the OnPod CLI.\nSent at ${sentAt}.`;
  await sendEmail({ to, subject, html, text });
  console.log(
    JSON.stringify(
      {
        to,
        from: process.env.RESEND_FROM_EMAIL || "OnPod <hi@onpod.io>",
        sandboxMode: !process.env.RESEND_API_KEY,
        sentAt,
      },
      null,
      2,
    ),
  );
};

main().catch((e) => {
  console.error(JSON.stringify({ error: (e as Error).message }, null, 2));
  process.exit(1);
});
