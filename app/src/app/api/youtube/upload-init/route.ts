import { NextResponse } from "next/server";
import { decodeFileId, getDownloadUrl, b2, bucket } from "@/lib/b2";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { getFreshAccessToken, getConnection, setActiveChannel } from "@/lib/youtube-store";
import { startResumableUpload } from "@/lib/youtube";
import { getSession } from "@/lib/session";
import { canAccessKey } from "@/lib/access";
import { gate } from "@/lib/plan-gate-route";
import { getAI } from "@/lib/transcript-store";

interface RequestBody {
  fileId: string;
  title?: string;
  description?: string;
  tags?: string[];
  vidType?: "long" | "short";
  visibility?: "public" | "unlisted" | "private";
  publishMode?: "now" | "schedule";
  scheduledAt?: string | null;
  language?: string;
  // Which connected channel to publish to. Defaults to the active one.
  channelId?: string;
}

export async function POST(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const gated = await gate(user, "youtube");
  if (gated) return gated;

  const body = (await req.json()) as RequestBody;
  if (!body.fileId)
    return NextResponse.json({ error: "missing_fileId" }, { status: 400 });

  let key: string;
  try {
    key = decodeFileId(body.fileId);
  } catch {
    return NextResponse.json({ error: "invalid_file_id" }, { status: 400 });
  }
  if (!canAccessKey(user, key)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let conn = await getConnection(user.id);
  if (!conn) {
    return NextResponse.json(
      { error: "not_connected", message: "Connect YouTube first." },
      { status: 412 },
    );
  }
  // Publish to the requested channel: make it active so the token columns hold
  // its credentials, then read the fresh token.
  if (body.channelId && body.channelId !== conn.activeChannelId) {
    await setActiveChannel(user.id, body.channelId);
    conn = (await getConnection(user.id)) ?? conn;
  }
  const accessToken = await getFreshAccessToken(user.id);
  if (!accessToken) {
    return NextResponse.json({ error: "token_refresh_failed" }, { status: 401 });
  }

  // Probe file size + content-type from B2
  let sizeBytes = 0;
  let contentType = "video/mp4";
  try {
    const head = await b2.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    sizeBytes = head.ContentLength ?? 0;
    contentType = head.ContentType ?? "video/mp4";
  } catch (err) {
    return NextResponse.json(
      { error: "b2_head_failed", message: (err as Error).message },
      { status: 500 },
    );
  }

  const ai = (await getAI(key)) ?? null;
  const title = (body.title ?? ai?.title ?? "Untitled").slice(0, 100);
  const description = (
    body.description ??
    (ai ? `${ai.description}${ai.chapters ? `\n\n${ai.chapters}` : ""}` : "")
  ).slice(0, 5000);
  const tags = body.tags ?? ai?.tags ?? [];

  let publishAt: string | null = null;
  if (body.publishMode === "schedule" && body.scheduledAt) {
    const local = new Date(body.scheduledAt);
    if (!Number.isNaN(local.getTime())) publishAt = local.toISOString();
  }
  const privacyStatus = publishAt ? "private" : (body.visibility ?? "public");

  // Browser will fetch the video from this signed URL and PUT to YouTube.
  let videoUrl: string;
  try {
    videoUrl = await getDownloadUrl(key, 60 * 60 * 6);
  } catch (err) {
    return NextResponse.json(
      { error: "b2_signed_url_failed", message: (err as Error).message },
      { status: 500 },
    );
  }

  try {
    const { sessionUri } = await startResumableUpload({
      accessToken,
      sizeBytes,
      contentType,
      title,
      description,
      tags,
      privacyStatus,
      publishAt,
      isShort: body.vidType === "short",
      defaultLanguage: body.language,
      defaultAudioLanguage: body.language,
    });
    return NextResponse.json({
      sessionUri,
      videoUrl,
      sizeBytes,
      contentType,
      title,
      vidType: body.vidType ?? "long",
      publishAt,
      visibility: privacyStatus,
      channelId: conn.activeChannelId,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "youtube_init_failed", message: (err as Error).message },
      { status: 500 },
    );
  }
}
