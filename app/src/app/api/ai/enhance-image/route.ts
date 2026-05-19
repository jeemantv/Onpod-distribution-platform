import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { b2, bucket, decodeFileId, publicUrl } from "@/lib/b2";
import { enhanceImage, ENHANCE_PROMPT_DEFAULT } from "@/lib/gemini";
import { getSession } from "@/lib/session";

interface RequestBody {
  fileId: string;
  // Provide one of:
  imageUrl?: string;
  imageBase64?: string;
  prompt?: string;
  label?: string; // suffix for the sidecar filename (default: "enhanced")
}

export async function POST(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as RequestBody;
  if (!body.fileId || (!body.imageUrl && !body.imageBase64)) {
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

  // Get the source bytes
  let inputBase64: string;
  let inputMime = "image/jpeg";
  try {
    if (body.imageBase64) {
      inputBase64 = body.imageBase64;
    } else {
      const r = await fetch(body.imageUrl!);
      if (!r.ok) throw new Error(`source fetch ${r.status}`);
      inputMime = r.headers.get("content-type") ?? "image/jpeg";
      const buf = Buffer.from(await r.arrayBuffer());
      inputBase64 = buf.toString("base64");
    }
  } catch (err) {
    return NextResponse.json(
      { error: "source_fetch", message: (err as Error).message },
      { status: 502 },
    );
  }

  try {
    const enhanced = await enhanceImage(
      inputBase64,
      inputMime,
      body.prompt ?? ENHANCE_PROMPT_DEFAULT,
    );
    const ext = enhanced.mimeType.includes("png") ? "png" : "jpg";
    const label = (body.label ?? "enhanced").replace(/[^\w-]/g, "");
    const outKey = `${key}.${label}.${ext}`;
    await b2.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: outKey,
        Body: Buffer.from(enhanced.base64, "base64"),
        ContentType: enhanced.mimeType,
        CacheControl: "public, max-age=3600",
      }),
    );
    return NextResponse.json({
      url: publicUrl(outKey),
      key: outKey,
      mimeType: enhanced.mimeType,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "gemini_error", message: (err as Error).message },
      { status: 500 },
    );
  }
}
