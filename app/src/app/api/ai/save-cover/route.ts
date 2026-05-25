// Save a rendered thumbnail (or any external image URL) as the file's
// canonical `.cover.jpg` in B2. The client used to fetch the image
// itself + re-upload as base64 — that triggered a "Failed to fetch"
// when Bannerbear's CORS didn't cooperate, plus needlessly bounced the
// bytes through the browser.

import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { b2, bucket, decodeFileId, publicUrl } from "@/lib/b2";
import { requireSession } from "@/lib/session";
import { canAccessKey } from "@/lib/access";

export const maxDuration = 30;

interface Body {
  fileId: string;
  sourceUrl: string;
  label?: string;
}

function safeLabel(s: string): string {
  return s.replace(/[^\w-]+/g, "-").slice(0, 40) || "cover";
}

export async function POST(req: Request) {
  const user = requireSession();
  const body = (await req.json()) as Body;
  if (!body.fileId || !body.sourceUrl) {
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
    const fetched = await fetch(body.sourceUrl, { cache: "no-store" });
    if (!fetched.ok) {
      return NextResponse.json(
        { error: "fetch_failed", message: `Source ${fetched.status}` },
        { status: 502 },
      );
    }
    const mime = fetched.headers.get("content-type") ?? "image/jpeg";
    const buf = Buffer.from(await fetched.arrayBuffer());
    if (buf.length > 8 * 1024 * 1024) {
      return NextResponse.json(
        { error: "too_large", message: `Source is ${(buf.length / 1024 / 1024).toFixed(1)} MB (max 8)` },
        { status: 413 },
      );
    }
    const ext = mime.includes("png") ? "png" : "jpg";
    const label = safeLabel(body.label ?? "cover");
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
      { error: "save_failed", message: (err as Error).message },
      { status: 500 },
    );
  }
}
