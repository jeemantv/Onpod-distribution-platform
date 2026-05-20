// Saves a base64 image next to the source file in B2. Used by the
// CropZoom modal to persist the adjusted frame so Bannerbear can fetch
// it by URL.

import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { b2, bucket, decodeFileId, publicUrl } from "@/lib/b2";
import { canAccessKey } from "@/lib/access";
import { requireSession } from "@/lib/session";

export const maxDuration = 30;

interface Body {
  fileId: string;
  imageBase64: string;
  label?: string;
  mimeType?: string;
}

function safeLabel(s: string): string {
  return s.replace(/[^\w-]+/g, "-").slice(0, 40) || "adj";
}

export async function POST(req: Request) {
  const user = requireSession();
  const body = (await req.json()) as Body;
  if (!body.fileId || !body.imageBase64) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
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

  try {
    const buf = Buffer.from(body.imageBase64, "base64");
    if (buf.length > 6 * 1024 * 1024) {
      return NextResponse.json(
        { error: "too_large", message: "Image > 6 MB" },
        { status: 413 },
      );
    }
    const mime = body.mimeType ?? "image/jpeg";
    const ext = mime.includes("png") ? "png" : "jpg";
    const label = safeLabel(body.label ?? `adj-${Date.now()}`);
    const outKey = `${key}.${label}.${ext}`;
    await b2.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: outKey,
        Body: buf,
        ContentType: mime,
        CacheControl: "public, max-age=3600",
      }),
    );
    return NextResponse.json({
      url: publicUrl(outKey),
      key: outKey,
      bytes: buf.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "b2_error", message: (err as Error).message },
      { status: 500 },
    );
  }
}
