import { NextResponse } from "next/server";
import { fetchYouTubeMeta, parseYouTubeId, watchUrl } from "@/lib/youtube-ai";
import { createJob } from "@/lib/yt-ai-store";
import { isResponse, requireAdminApi, errorJson } from "../_shared";

export const dynamic = "force-dynamic";

// Creates a run for a YouTube link. Cheap — just resolves the ID and pulls the
// public title/channel. The heavy lifting happens in /transcript.
export async function POST(req: Request) {
  const user = requireAdminApi();
  if (isResponse(user)) return user;

  const { url } = (await req.json()) as { url?: string };
  const videoId = parseYouTubeId(url ?? "");
  if (!videoId) {
    return NextResponse.json(
      { error: "bad_url", message: "That doesn't look like a YouTube link." },
      { status: 400 },
    );
  }

  try {
    const meta = await fetchYouTubeMeta(videoId);
    const job = await createJob({
      userId: user.id,
      videoId,
      url: watchUrl(videoId),
      videoTitle: meta.title,
      channel: meta.channel,
      coverUrl: meta.thumbnailUrl,
    });
    return NextResponse.json({ job });
  } catch (err) {
    return errorJson(err);
  }
}
