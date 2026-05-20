// Background removal. Uses remove.bg (most reliable for people/faces);
// falls back to Photoroom if REMOVE_BG_API_KEY is not set and
// PHOTOROOM_API_KEY is. Saves the result next to the source as a PNG
// (transparent) so Bannerbear templates can layer it over a backdrop.

import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { b2, bucket, decodeFileId, publicUrl } from "@/lib/b2";
import { canAccessKey } from "@/lib/access";
import { requireSession } from "@/lib/session";

export const maxDuration = 60;

interface Body {
  fileId: string;
  imageUrl: string;
  label?: string;
}

async function removeBg(imageUrl: string): Promise<{ buf: Buffer; mime: string }> {
  const removeBgKey = process.env.REMOVE_BG_API_KEY;
  const photoroomKey = process.env.PHOTOROOM_API_KEY;

  if (removeBgKey) {
    const form = new FormData();
    form.append("image_url", imageUrl);
    form.append("size", "auto");
    form.append("format", "png");
    const res = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: { "X-Api-Key": removeBgKey },
      body: form,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`remove.bg ${res.status}: ${text.slice(0, 300)}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return { buf, mime: "image/png" };
  }

  if (photoroomKey) {
    // Photoroom API — accepts image_url and returns the cutout.
    const form = new FormData();
    form.append("imageUrl", imageUrl);
    const res = await fetch(
      "https://sdk.photoroom.com/v1/segment",
      {
        method: "POST",
        headers: { "x-api-key": photoroomKey },
        body: form,
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`photoroom ${res.status}: ${text.slice(0, 300)}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return { buf, mime: "image/png" };
  }

  throw new Error(
    "No background-removal provider configured. Set REMOVE_BG_API_KEY or PHOTOROOM_API_KEY.",
  );
}

export async function POST(req: Request) {
  const user = requireSession();
  const body = (await req.json()) as Body;
  if (!body.fileId || !body.imageUrl) {
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
    const { buf, mime } = await removeBg(body.imageUrl);
    const label = (body.label ?? `nobg-${Date.now()}`).replace(/[^\w-]/g, "");
    const outKey = `${key}.${label}.png`;
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
      { error: "remove_bg_error", message: (err as Error).message },
      { status: 500 },
    );
  }
}
