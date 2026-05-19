import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { b2, bucket, decodeFileId, publicUrl } from "@/lib/b2";
import { pickThumbnailFrames } from "@/lib/claude-vision";
import { getSession } from "@/lib/session";

interface RequestBody {
  fileId: string;
  framesBase64: string[]; // each is a base64 JPEG (no data: prefix)
}

export async function POST(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as RequestBody;
  if (!body.fileId || !Array.isArray(body.framesBase64) || body.framesBase64.length === 0) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
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

  try {
    const picks = await pickThumbnailFrames(body.framesBase64);
    if (picks.length === 0) {
      return NextResponse.json({ error: "no_picks", message: "Claude returned no usable picks" }, { status: 500 });
    }

    const thumbnails: { label: string; url: string; reason: string; key: string }[] = [];
    for (const p of picks) {
      const frame = body.framesBase64[p.index];
      if (!frame) continue;
      const buf = Buffer.from(frame, "base64");
      const thumbKey = `${key}.thumb-${p.label}.jpg`;
      await b2.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: thumbKey,
          Body: buf,
          ContentType: "image/jpeg",
          CacheControl: "public, max-age=3600",
        }),
      );
      thumbnails.push({
        label: p.label,
        url: publicUrl(thumbKey),
        reason: p.reason,
        key: thumbKey,
      });
    }
    return NextResponse.json({ thumbnails });
  } catch (err) {
    return NextResponse.json(
      { error: "vision_error", message: (err as Error).message },
      { status: 500 },
    );
  }
}
