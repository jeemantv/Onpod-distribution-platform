import { NextResponse } from "next/server";
import { listJobs } from "@/lib/yt-ai-store";
import { isResponse, requireAdminApi } from "../_shared";

export const dynamic = "force-dynamic";

// Recent runs for the sidebar. Transcripts/articles are stripped — the list
// only needs enough to render a row.
export async function GET() {
  const user = requireAdminApi();
  if (isResponse(user)) return user;

  const jobs = await listJobs(user.id);
  return NextResponse.json({
    jobs: jobs.map((j) => ({
      id: j.id,
      videoId: j.videoId,
      url: j.url,
      videoTitle: j.videoTitle,
      channel: j.channel,
      coverUrl: j.coverUrl,
      hasTranscript: !!j.transcript,
      transcriptComplete: j.transcriptComplete,
      hasAI: !!j.ai,
      createdAt: j.createdAt,
    })),
  });
}
