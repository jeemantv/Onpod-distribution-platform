import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { b2, bucket, decodeFileId, publicUrl } from "@/lib/b2";
import { getSession } from "@/lib/session";
import { gate } from "@/lib/plan-gate-route";
import { activeVideoKey } from "@/lib/versions-store";

const COVER_SUFFIX = ".cover.jpg";

export async function POST(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const gated = await gate(user, "thumbnails");
  if (gated) return gated;

  const { fileId, imageBase64 } = (await req.json()) as {
    fileId: string;
    imageBase64: string;
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
  const [ownerId] = canonical.split("/", 1);
  if (user.role !== "admin" && ownerId !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  // Cover art attaches to whichever version is currently active so a
  // re-upload (v2) gets its own thumbnail and the v1 cover doesn't leak
  // into the new version.
  const key = await activeVideoKey(canonical);

  try {
    const buf = Buffer.from(imageBase64, "base64");
    if (buf.length > 4 * 1024 * 1024) {
      return NextResponse.json(
        { error: "too_large", message: "Cover art must be under 4MB" },
        { status: 413 },
      );
    }
    const coverKey = key + COVER_SUFFIX;
    await b2.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: coverKey,
        Body: buf,
        ContentType: "image/jpeg",
        CacheControl: "public, max-age=3600",
      }),
    );
    return NextResponse.json({
      key: coverKey,
      url: publicUrl(coverKey),
    });
  } catch (err) {
    return NextResponse.json(
      { error: "b2_error", message: (err as Error).message },
      { status: 500 },
    );
  }
}
