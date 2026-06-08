import { NextResponse } from "next/server";
import { runDueBuckets } from "@/lib/bucket-runner";

// Scheduler entrypoint. Multi-tenant: posts one clip for every user's bucket
// whose schedule slot is currently due. Trigger it from a Vercel cron or any
// external scheduler (n8n) — auth via CRON_SECRET (Bearer) or the existing
// ONPOD_SERVICE_KEY header.
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  const svc = process.env.ONPOD_SERVICE_KEY;
  if (svc && req.headers.get("x-onpod-service-key") === svc) return true;
  // If neither secret is configured, refuse rather than run unauthenticated.
  return false;
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runDueBuckets(new Date());
  return NextResponse.json({ ok: true, ...result });
}

// Vercel cron issues GET; allow POST too for manual/n8n triggers.
export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
