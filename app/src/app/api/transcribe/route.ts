import { NextResponse } from "next/server";

// TODO: spec §6.3 — call Deepgram, save to `transcripts`, increment credits, trigger AI generation.
export async function POST(req: Request) {
  const { fileId } = (await req.json()) as { fileId: string };
  return NextResponse.json({
    jobId: `dg_${fileId}_${Date.now()}`,
    status: "processing",
  });
}
