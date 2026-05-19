import { NextResponse } from "next/server";

// TODO: spec §6.3 — return real Deepgram job status.
export async function GET(
  _req: Request,
  { params }: { params: { fileId: string } },
) {
  return NextResponse.json({
    fileId: params.fileId,
    status: "processing",
    progress: Math.floor(Math.random() * 100),
  });
}
