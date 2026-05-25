import { NextResponse } from "next/server";
import { decodeFileId } from "@/lib/b2";
import { addToPlaylist, setThumbnail } from "@/lib/youtube";
import { getFreshAccessToken, getConnection } from "@/lib/youtube-store";
import { getSession } from "@/lib/session";
import { canAccessKey } from "@/lib/access";
import { recordPublish } from "@/lib/publish-history-store";

// Thumbnail fetch + thumbnails.set + playlistItems.insert + B2 write
// adds up to >10s sometimes. Vercel Hobby caps at 60s, which is plenty.
export const maxDuration = 60;

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
  if (!canAccessKey(user, key)) {
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
        const r = await fetch(body.thumbnailUrl, { cache: "no-store" });
        if (!r.ok) {
          throw new Error(`thumbnail fetch ${r.status}`);
        }
        thumbType = r.headers.get("content-type") ?? "image/jpeg";
        thumbBytes = new Uint8Array(await r.arrayBuffer());
      }
      if (thumbBytes && thumbBytes.length > 0) {
        if (thumbBytes.length > 2 * 1024 * 1024) {
          throw new Error(
            `thumbnail is ${(thumbBytes.length / 1024 / 1024).toFixed(2)}MB, YouTube max is 2MB`,
          );
        }
        const r = await setThumbnail(
          accessToken,
          body.videoId,
          thumbBytes,
          thumbType,
        );
        result.thumbnailSet = true;
        if (r.defaultUrl) result.thumbnailUrl = r.defaultUrl;
        result.thumbnailBytes = thumbBytes.length;
        result.thumbnailType = thumbType;
      } else {
        result.thumbnailSkipped = "no thumbnail provided";
      }
    } catch (err) {
      result.thumbnailError = (err as Error).message;
      console.error("[yt upload-complete] thumbnail set failed", err);
    }

    // Add to playlist — log the YouTube response so we can see scope/quota
    // failures in Vercel logs even though we don't fail the whole publish.
    if (body.playlistId) {
      try {
        await addToPlaylist(accessToken, body.videoId, body.playlistId);
        result.playlistAdded = body.playlistId;
      } catch (err) {
        const msg = (err as Error).message;
        result.playlistError = msg;
        console.error("[yt upload-complete] playlist add failed", {
          videoId: body.videoId,
          playlistId: body.playlistId,
          message: msg,
        });
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
