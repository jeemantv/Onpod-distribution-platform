import { NextResponse } from "next/server";
import { decodeFileId } from "@/lib/b2";
import {
  getAI,
  getJobMarker,
  getTranscript,
  hasAI,
  hasTranscript,
} from "@/lib/transcript-store";
import { getSession } from "@/lib/session";

// Status derives purely from B2 state:
//   ai.json present                → ready
//   transcript.json present        → generating
//   job.json present, no transcript → transcribing (deepgram in flight)
//   nothing                        → idle
export async function GET(
  req: Request,
  { params }: { params: { fileId: string } },
) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let key: string;
  try {
    key = decodeFileId(params.fileId);
  } catch {
    return NextResponse.json({ error: "invalid_file_id" }, { status: 400 });
  }
  const [ownerId] = key.split("/", 1);
  if (user.role !== "admin" && ownerId !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const includeData = new URL(req.url).searchParams.get("include") === "data";

  if (await hasAI(key)) {
    const body: Record<string, unknown> = {
      status: "ready",
      progress: 100,
      hasTranscript: true,
      hasAI: true,
    };
    if (includeData) {
      body.transcript = await getTranscript(key);
      body.ai = await getAI(key);
    }
    return NextResponse.json(body);
  }

  if (await hasTranscript(key)) {
    const body: Record<string, unknown> = {
      status: "generating",
      progress: 80,
      hasTranscript: true,
      hasAI: false,
    };
    if (includeData) body.transcript = await getTranscript(key);
    return NextResponse.json(body);
  }

  const marker = await getJobMarker(key);
  if (marker) {
    const elapsed = Date.now() - marker.startedAt;
    const progress =
      marker.stage === "transcribing"
        ? Math.min(70, 5 + Math.round(elapsed / (3 * 60 * 1000) * 65))
        : 80;
    return NextResponse.json({
      status: marker.error ? "error" : marker.stage,
      progress,
      hasTranscript: false,
      hasAI: false,
      error: marker.error,
    });
  }

  return NextResponse.json({
    status: "idle",
    progress: 0,
    hasTranscript: false,
    hasAI: false,
  });
}
