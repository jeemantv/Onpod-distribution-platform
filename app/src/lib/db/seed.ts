// Idempotent seed: ensures the three demo accounts exist with the literal
// "demo" password. Safe to re-run; uses email-based UPSERT.

import "dotenv/config";
import { config as loadEnv } from "dotenv";
import bcrypt from "bcryptjs";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { eq, sql } from "drizzle-orm";
import ws from "ws";
import { credits, users } from "./schema";
import type { StoredRole } from "../auth-store";

loadEnv({ path: ".env.local", override: false });
neonConfig.webSocketConstructor = ws;

const DEMO_PASSWORD = "demo";

interface Seed {
  email: string;
  firstName: string;
  lastName: string;
  avatar: string;
  avatarColor: string;
  role: StoredRole;
}

const SEEDS: Seed[] = [
  {
    email: "admin@onpod.io",
    firstName: "Jeremy",
    lastName: "Prudhomme",
    avatar: "JP",
    avatarColor: "linear-gradient(135deg,#a855f7,#ec4899)",
    role: "admin",
  },
  {
    email: "editor@onpod.io",
    firstName: "Eli",
    lastName: "Editor",
    avatar: "EE",
    avatarColor: "linear-gradient(135deg,#60a5fa,#a855f7)",
    role: "editor",
  },
  {
    email: "client@onpod.io",
    firstName: "Demo",
    lastName: "Client",
    avatar: "DC",
    avatarColor: "linear-gradient(135deg,#ff3b30,#ff8a00)",
    role: "client",
  },
];

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  for (const s of SEEDS) {
    const [user] = await db
      .insert(users)
      .values({
        email: s.email,
        passwordHash,
        role: s.role,
        plan: "unlimited",
        firstName: s.firstName,
        lastName: s.lastName,
        avatar: s.avatar,
        avatarColor: s.avatarColor,
      })
      .onConflictDoUpdate({
        target: users.email,
        set: {
          firstName: s.firstName,
          lastName: s.lastName,
          avatar: s.avatar,
          avatarColor: s.avatarColor,
          role: s.role,
          plan: "unlimited",
        },
      })
      .returning();

    // Ensure a credits row exists; don't reset usage counters if it does.
    await db
      .insert(credits)
      .values({ userId: user.id })
      .onConflictDoNothing({ target: credits.userId });

    console.log(`seeded ${s.email} (${user.id})`);
  }

  // Sanity check
  const total = await db.select({ count: sql<number>`count(*)::int` }).from(users);
  console.log(`users in db: ${total[0].count}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
