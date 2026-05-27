// One-off: mint a magic sign-in link against the prod DB. Useful for
// testing accounts where the email send isn't verified yet.
//
//   npx tsx scripts/mint-link.ts <email> [origin]
//
// Defaults: jeremymortgages@gmail.com, https://onpod.vercel.app

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local", override: false });

import { issueMagicToken, buildMagicLinkUrl } from "@/lib/magic-link";
import {
  getUserByEmail,
  createUser,
  updateUserHomeStudio,
  updateUserSelfUpload,
} from "@/lib/auth-store";

const email = process.argv[2] ?? "jeremymortgages@gmail.com";
const origin = process.argv[3] ?? "https://onpod.vercel.app";

const main = async () => {
  let user = await getUserByEmail(email);
  let created = false;
  if (!user) {
    user = await createUser({
      email,
      password: `m_${Math.random().toString(36).slice(2, 18)}`,
      firstName: "Jeremy",
      lastName: "Mortgages",
      role: "client",
    });
    created = true;
    await updateUserHomeStudio(user.id, "externals").catch(() => undefined);
    await updateUserSelfUpload(user.id, true).catch(() => undefined);
  }
  const { token, expiresAt } = await issueMagicToken(email);
  const url = buildMagicLinkUrl(origin, token);
  console.log(
    JSON.stringify(
      {
        email,
        created,
        userId: user.id,
        expiresAt: expiresAt.toISOString(),
        url,
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
