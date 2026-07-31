import { NextResponse } from "next/server";
import { MAX_SEGMENTS, SEGMENT_MINUTES, transcribeSegment } from "@/lib/youtube-ai";
import { appendTranscript, resetTranscript } from "@/lib/yt-ai-store";
import { errorJson, isResponse, loadOwnedJob, requireAdminApi } from "../_shared";

// One 20-minute window of video per call. Gemini has to watch it, so give the
// function real headroom — but the windowing is what keeps us inside it.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Transcribes the NEXT un-transcribed window and reports progress. The client
// calls this in a loop until `complete` comes back true, which keeps a
// two-hour episode from ever hitting the function time limit in one shot.
export async function POST(req: Request) {
  const user = requireAdminApi();
  if (isResponse(user)) return user;

  const { jobId, restart } = (await req.json()) as { jobId?: string; restart?: boolean };
  const job = await loadOwnedJob(jobId ?? "", user.id);
  if (isResponse(job)) return job;

  if (restart) await resetTranscript(job.id);
  const segment = restart ? 0 : job.segmentsDone;

  if (!restart && job.transcriptComplete) {
    return NextResponse.json({
      complete: true,
      segmentsDone: job.segmentsDone,
      minutesDone: job.segmentsDone * SEGMENT_MINUTES,
      chars: (job.transcript ?? "").length,
    });
  }

  if (segment >= MAX_SEGMENTS) {
    const updated = await appendTranscript(job.id, "", segment, true);
    return NextResponse.json({
      complete: true,
      truncated: true,
      segmentsDone: updated?.segmentsDone ?? segment,
      minutesDone: segment * SEGMENT_MINUTES,
      chars: (updated?.transcript ?? "").length,
      message: `Stopped at ${(MAX_SEGMENTS * SEGMENT_MINUTES) / 60} hours of video.`,
    });
  }

  try {
    const result = await transcribeSegment(job.videoId, segment);
    const updated = await appendTranscript(job.id, result.text, segment + 1, result.ended);
    return NextResponse.json({
      complete: result.ended,
      segmentsDone: segment + 1,
      minutesDone: (segment + 1) * SEGMENT_MINUTES,
      chars: (updated?.transcript ?? "").length,
      transcript: updated?.transcript ?? "",
    });
  } catch (err) {
    return errorJson(err);
  }
}
