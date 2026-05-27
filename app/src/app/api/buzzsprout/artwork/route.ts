// Upload an artwork image to B2 for a specific file. Returns the public
// URL — used by the Buzzsprout publish modal so we can hand a real
// `artwork_url` to the Buzzsprout API. Lives in /api/buzzsprout/ (not
// /api/ai/cover-art) because it isn't an AI feature and shouldn't be
// gated by the thumbnails plan tier.

import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { b2, bucket, decodeFileId, publicUrl } from "@/lib/b2";
import { getSession } from "@/lib/session";
import { canAccessKey } from "@/lib/access";
import { activeVideoKey } from "@/lib/versions-store";

const SUFFIX = ".buzzsprout-artwork.jpg";
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { fileId, imageBase64 } = (await req.json().catch(() => ({}))) as {
    fileId?: string;
    imageBase64?: string;
  };
  if (!fileId || !imageBase64) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  let canonical: string;
  try {
    canonical = decodeFileId(fileId);
  } catch {
    return NextResponse.json({ error: "invalid_file_id" }, { status: 400 });
  }
  if (!canAccessKey(user, canonical)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const key = await activeVideoKey(canonical);

  // Tolerate base64 with or without the data: URL prefix.
  const raw = imageBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, "");
  const buf = Buffer.from(raw, "base64");
  if (buf.length === 0) {
    return NextResponse.json(
      { error: "empty_image", message: "Decoded image is empty." },
      { status: 400 },
    );
  }
  if (buf.length > MAX_BYTES) {
    return NextResponse.json(
      { error: "too_large", message: "Artwork must be under 4MB." },
      { status: 413 },
    );
  }

  const artKey = key + SUFFIX;
  await b2.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: artKey,
      Body: buf,
      ContentType: "image/jpeg",
      CacheControl: "public, max-age=3600",
    }),
  );
  return NextResponse.json({ key: artKey, url: publicUrl(artKey) });
}
