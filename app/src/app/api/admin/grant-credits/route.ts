import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";

// TODO: spec §12.3 — increment `credits.bonus*` columns, write `credit_transactions` row.
export async function POST(req: Request) {
  requireAdmin();
  const body = (await req.json()) as {
    userId: string;
    podcasts?: number;
    articles?: number;
    opusClips?: number;
    coverArts?: number;
  };
  return NextResponse.json({ ok: true, granted: body });
}
