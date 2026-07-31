import { NextResponse } from "next/server";
import { importCaptions } from "@/lib/youtube-captions";
import { setTranscript } from "@/lib/yt-ai-store";
import { errorJson, isResponse, loadOwnedJob, requireAdminApi } from "../_shared";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

// Transcript via the owner's YouTube OAuth token. This is the ONLY way to read
// an unlisted or private video — Gemini fetches videos anonymously, so it can
// only ever see public ones. The client tries this first and falls back to
// Gemini when the video isn't on a connected channel.
export async function POST(req: Request) {
  const user = requireAdminApi();
  if (isResponse(user)) return user;

  const { jobId } = (await req.json()) as { jobId?: string };
  const job = await loadOwnedJob(jobId ?? "", user.id);
  if (isResponse(job)) return job;

  try {
    const result = await importCaptions(user.id, job.videoId);
    if (!result.ok) {
      // Not an error the caller should stop on — Gemini is the fallback.
      return NextResponse.json({ imported: false, reason: result.reason, message: result.message });
    }

    const updated = await setTranscript(job.id, result.transcript, {
      videoTitle: result.info?.title,
      channel: result.info?.channelTitle || result.channelTitle,
      coverUrl: result.info?.thumbnailUrl ?? undefined,
    });
    return NextResponse.json({
      imported: true,
      chars: result.transcript.length,
      source:
        result.trackKind === "ASR"
          ? "YouTube auto-captions"
          : `YouTube captions${result.language ? ` (${result.language})` : ""}`,
      privacyStatus: result.info?.privacyStatus ?? "",
      channel: result.channelTitle,
      job: updated,
    });
  } catch (err) {
    return errorJson(err);
  }
}
