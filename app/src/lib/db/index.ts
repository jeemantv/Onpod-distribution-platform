import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";

if (typeof WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws;
}

declare global {
  // eslint-disable-next-line no-var
  var __onpodDbPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __onpodDb: NeonDatabase<typeof schema> | undefined;
}

function buildClient(): NeonDatabase<typeof schema> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Run `vercel env pull` or add it to .env.local.");
  }
  if (!global.__onpodDbPool) {
    global.__onpodDbPool = new Pool({ connectionString: url });
  }
  return drizzle(global.__onpodDbPool, { schema });
}

// Lazy proxy: the real client is built on first property access, not at
// import time. This keeps `next build` from crashing when env vars haven't
// been pulled yet and lets server-only code import this module freely.
export const db: NeonDatabase<typeof schema> = new Proxy({} as NeonDatabase<typeof schema>, {
  get(_target, prop) {
    if (!global.__onpodDb) {
      global.__onpodDb = buildClient();
    }
    return Reflect.get(global.__onpodDb, prop, global.__onpodDb);
  },
});

export { schema };
export type Database = NeonDatabase<typeof schema>;
