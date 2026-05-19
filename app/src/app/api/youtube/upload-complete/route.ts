import { NextResponse } from "next/server";
import { decodeFileId } from "@/lib/b2";
import { addToPlaylist, setThumbnail } from "@/lib/youtube";
import { getFreshAccessToken, getConnection } from "@/lib/youtube-store";
import { getSession } from "@/lib/session";
import { recordPublish } from "@/lib/publish-history-store";

interface RequestBody {
  fileId: string;
  videoId: string;
  title: string;
  vidType?: "long" | "short";
  publishAt?: string | null;
  visibility?: "public" | "unlisted" | "private";
  playlistId?: string | null;
  thumbnailUrl?: string | null;
  thumbnailBase64?: string | null;
}

export async function POST(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as RequestBody;
  if (!body.fileId || !body.videoId) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
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
  const accessToken = await getFreshAccessToken(user.id);

  // Side effects — do best-effort, return whatever succeeded
  const result: Record<string, unknown> = { videoId: body.videoId };

  if (accessToken && conn) {
    // Set thumbnail
    try {
      let thumbBytes: Uint8Array | null = null;
      let thumbType = "image/jpeg";
      if (body.thumbnailBase64) {
        thumbBytes = new Uint8Array(Buffer.from(body.thumbnailBase64, "base64"));
      } else if (body.thumbnailUrl) {
        const r = await fetch(body.thumbnailUrl);
        if (r.ok) {
          thumbType = r.headers.get("content-type") ?? "image/jpeg";
          thumbBytes = new Uint8Array(await r.arrayBuffer());
        }
      }
      if (thumbBytes && thumbBytes.length > 0) {
        await setThumbnail(accessToken, body.videoId, thumbBytes, thumbType);
        result.thumbnailSet = true;
      }
    } catch (err) {
      result.thumbnailError = (err as Error).message;
    }

    // Add to playlist
    if (body.playlistId) {
      try {
        await addToPlaylist(accessToken, body.videoId, body.playlistId);
        result.playlistAdded = body.playlistId;
      } catch (err) {
        result.playlistError = (err as Error).message;
      }
    }
  }

  // Record publish history
  const name = key.split("/").slice(-1)[0] ?? "file";
  try {
    await recordPublish({
      userId: user.id,
      fileId: body.fileId,
      fileKey: key,
      fileName: name,
      platform: "youtube",
      action: body.publishAt ? "scheduled" : "published",
      vidType: body.vidType === "short" ? "short" : "long",
      externalId: body.videoId,
      externalUrl: `https://www.youtube.com/watch?v=${body.videoId}`,
      scheduledFor: body.publishAt ?? null,
      metadata: {
        title: body.title,
        channelId: conn?.activeChannelId,
        privacyStatus: body.visibility,
      },
    });
  } catch (err) {
    result.historyError = (err as Error).message;
  }

  return NextResponse.json(result);
}
