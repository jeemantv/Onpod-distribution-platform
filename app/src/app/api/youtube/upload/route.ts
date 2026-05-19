import { NextResponse } from "next/server";
import { decodeFileId, getDownloadUrl } from "@/lib/b2";
import { getFreshAccessToken, getConnection } from "@/lib/youtube-store";
import { uploadVideo } from "@/lib/youtube";
import { getSession } from "@/lib/session";
import { getAI } from "@/lib/transcript-store";

interface RequestBody {
  fileId: string;
  channelId?: string;
  title?: string;
  description?: string;
  tags?: string[];
  vidType?: "long" | "short";
  visibility?: "public" | "unlisted" | "private";
  publishMode?: "now" | "schedule" | "private";
  scheduledAt?: string | null;
}

export async function POST(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as RequestBody;
  if (!body.fileId) {
    return NextResponse.json({ error: "missing_fileId" }, { status: 400 });
  }

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

  const conn = await getConnection(user.id);
  if (!conn) {
    return NextResponse.json(
      { error: "not_connected", message: "Connect YouTube first." },
      { status: 412 },
    );
  }
  const accessToken = await getFreshAccessToken(user.id);
  if (!accessToken) {
    return NextResponse.json(
      { error: "token_refresh_failed" },
      { status: 401 },
    );
  }

  // Use AI metadata as the default if the client didn't send title/description/tags.
  const ai = (await getAI(key)) ?? null;
  const title = (body.title ?? ai?.title ?? "Untitled").slice(0, 100);
  const description = (
    body.description ??
    (ai ? `${ai.description}${ai.chapters ? `\n\n${ai.chapters}` : ""}` : "")
  ).slice(0, 5000);
  const tags = body.tags ?? ai?.tags ?? [];

  // Pull video bytes from B2 via signed URL.
  // TODO: spec §7.2 expects streaming via resumable upload for large files.
  // This multipart path loads the whole file into memory — fine up to ~250MB.
  // For >250MB we need true resumable: POST to /upload/youtube/v3/videos with
  // x-upload-content-length, then PUT chunks to the Location URL.
  let signedUrl: string;
  try {
    signedUrl = await getDownloadUrl(key, 60 * 60);
  } catch (err) {
    return NextResponse.json(
      { error: "b2_error", message: (err as Error).message },
      { status: 500 },
    );
  }

  const fetchRes = await fetch(signedUrl);
  if (!fetchRes.ok) {
    return NextResponse.json(
      { error: "b2_fetch_failed", status: fetchRes.status },
      { status: 502 },
    );
  }
  const contentType = fetchRes.headers.get("content-type") ?? "video/mp4";
  const buffer = await fetchRes.arrayBuffer();
  const videoBytes = new Uint8Array(buffer);

  // Translate scheduledAt (datetime-local, no timezone) into RFC3339 UTC.
  let publishAt: string | null = null;
  if (body.publishMode === "schedule" && body.scheduledAt) {
    const local = new Date(body.scheduledAt);
    if (!Number.isNaN(local.getTime())) publishAt = local.toISOString();
  }

  const privacyStatus =
    body.publishMode === "private" || publishAt
      ? "private"
      : (body.visibility ?? "public");

  try {
    const { videoId } = await uploadVideo({
      accessToken,
      videoBytes,
      contentType,
      title,
      description,
      tags,
      privacyStatus,
      publishAt,
      isShort: body.vidType === "short",
    });
    return NextResponse.json({
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      channelId: conn.activeChannelId,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "youtube_error", message: (err as Error).message },
      { status: 500 },
    );
  }
}
