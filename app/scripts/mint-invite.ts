// Mint a studio invite link. Visitors hit /invite/<token>, enter their
// email + name, get a 7-day trial account + magic link email.
//
//   npx tsx scripts/mint-invite.ts [studio-slug] [label]
//
// Defaults: studio=externals, label="Public trial"

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: false });

import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { studios, studioInvites } from "@/lib/db/schema";

const slug = process.argv[2] ?? "externals";
const label = process.argv[3] ?? "Public trial";

const main = async () => {
  const [studio] = await db.select().from(studios).where(eq(studios.slug, slug)).limit(1);
  if (!studio) {
    throw new Error(`No studio with slug "${slug}". Create it first under /admin/studios.`);
  }
  const token = randomBytes(24).toString("base64url");
  const [invite] = await db
    .insert(studioInvites)
    .values({ studioSlug: slug, token, label })
    .returning();
  const url = `https://onpod.vercel.app/invite/${encodeURIComponent(token)}`;
  const embed = `<iframe src="${url}" style="width:100%;max-width:480px;height:600px;border:0;background:#0a0a0b;border-radius:12px" loading="lazy" title="Start your OnPod trial"></iframe>`;
  console.log(
    JSON.stringify(
      {
        studio: { slug: studio.slug, displayName: studio.displayName, kind: studio.kind },
        invite: { id: invite.id, label: invite.label, token: invite.token },
        url,
        embed,
      },
      null,
      2,
    ),
  );
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
