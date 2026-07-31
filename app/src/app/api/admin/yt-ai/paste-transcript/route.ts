import { NextResponse } from "next/server";
import { srtToTranscript } from "@/lib/youtube-captions";
import { setTranscript } from "@/lib/yt-ai-store";
import { errorJson, isResponse, loadOwnedJob, requireAdminApi } from "../_shared";

export const dynamic = "force-dynamic";

// Manual transcript entry — the escape hatch for a video that neither path can
// read: unlisted (so Gemini can't watch it) AND without a caption track yet
// (so there's nothing to download). Paste the .srt/.vtt from YouTube Studio,
// or any plain text, and the rest of the tool works normally.
export async function POST(req: Request) {
  const user = requireAdminApi();
  if (isResponse(user)) return user;

  const { jobId, text } = (await req.json()) as { jobId?: string; text?: string };
  const job = await loadOwnedJob(jobId ?? "", user.id);
  if (isResponse(job)) return job;

  const raw = (text ?? "").trim();
  if (raw.length < 40) {
    return NextResponse.json(
      { error: "too_short", message: "That's not enough text to work with." },
      { status: 400 },
    );
  }

  // Timestamped subtitle formats get normalised to the same shape both other
  // paths produce, so chapters keep real timings. Plain text is stored as-is.
  const looksTimed = /\d{2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->/.test(raw);
  const transcript = looksTimed
    ? srtToTranscript(raw.replace(/^WEBVTT.*$/m, "").trim())
    : raw;

  if (!transcript.trim()) {
    return NextResponse.json(
      { error: "unparsed", message: "Couldn't read that subtitle file. Paste the text instead." },
      { status: 400 },
    );
  }

  const updated = await setTranscript(job.id, transcript);
  try {
    return NextResponse.json({
      ok: true,
      chars: transcript.length,
      timed: looksTimed,
      job: updated,
    });
  } catch (err) {
    return errorJson(err);
  }
}
