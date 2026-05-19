import { NextResponse } from "next/server";

// TODO: spec §9.2 — call OpusClip API with source_url + style, save job_id, deduct credit.
export async function POST(req: Request) {
  const body = (await req.json()) as Record<string, unknown>;
  return NextResponse.json({
    jobId: `opus_${Date.now()}`,
    status: "submitted",
    estimatedMinutes: 12,
    body,
  });
}
