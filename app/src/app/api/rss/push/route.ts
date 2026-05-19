import { NextResponse } from "next/server";
import { decodeFileId, getDownloadUrl } from "@/lib/b2";
import { getSession } from "@/lib/session";
import {
  addEpisode,
  getShowByUser,
  upsertShow,
  type Episode,
} from "@/lib/podcast-store";
import { getAI, getTranscript } from "@/lib/transcript-store";

interface RequestBody {
  fileId: string;
  title?: string;
  description?: string;
  season?: number;
  episode?: number;
}

export async function POST(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as RequestBody;
  if (!body.fileId)
    return NextResponse.json({ error: "missing_fileId" }, { status: 400 });

  let key: string;
  try {
    key = decodeFileId(body.fileId);
  } catch {
    return NextResponse.json({ error: "invalid_file_id" }, { status: 400 });
  }
  const [ownerId] = key.split("/", 1);
  if (user.role !== "admin" && ownerId !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let show = await getShowByUser(user.id);
  if (!show) {
    const slug = user.id.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
    show = await upsertShow({
      userId: user.id,
      slug,
      title: `${user.firstName} ${user.lastName} Podcast`,
      description: "A podcast distributed via OnPod Studios.",
      author: `${user.firstName} ${user.lastName}`,
      authorEmail: user.email,
      language: "en",
      categoryItunes: "Business",
      coverUrl: "",
      link: "https://onpod.io",
      explicit: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  const ai = await getAI(key);
  const transcript = await getTranscript(key);
  const title = body.title ?? ai?.title ?? "Untitled episode";
  const description = body.description ?? ai?.description ?? "";

  // TODO: For real distribution, enclosure URLs must be permanent and public.
  // Signed B2 URLs expire — Spotify and Apple will fail. Either:
  //   (a) Flip the bucket to allPublic and use the public download URL, OR
  //   (b) Add a proxy route /audio/{fileId} that 302s to a fresh signed URL.
  // (a) is what the bucket already is. Using long-TTL signed URL for now.
  const audioUrl = await getDownloadUrl(key, 60 * 60 * 24 * 7);

  const sizeBytes = transcript?.raw
    ? (typeof (transcript.raw as { metadata?: { content_length?: number } }).metadata?.content_length ===
      "number"
        ? ((transcript.raw as { metadata: { content_length: number } }).metadata.content_length)
        : 0)
    : 0;

  const ep: Episode = {
    guid: `onpod-${key}`,
    fileId: body.fileId,
    title,
    description,
    audioUrl,
    audioMime: key.endsWith(".mp3") ? "audio/mpeg" : key.endsWith(".wav") ? "audio/wav" : "video/mp4",
    audioBytes: sizeBytes,
    durationSeconds: transcript?.durationSeconds ?? 0,
    season: body.season,
    episode: body.episode,
    publishedAt: Date.now(),
  };

  const episodes = await addEpisode(show.slug, ep);
  const feedUrl = new URL(`/feeds/${show.slug}.xml`, req.url).toString();
  return NextResponse.json({
    show,
    feedUrl,
    episodeCount: episodes.length,
    addedEpisode: ep,
  });
}
