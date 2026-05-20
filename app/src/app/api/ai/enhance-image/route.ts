// Enhance an image for use as a thumbnail.
//
// Default path = Replicate Real-ESRGAN (4× upscale + face_enhance), which
// gives the best HD + crisp + bright result for podcast portraits. This
// is what the user actually means by "Enhance".
//
// Fallback = Gemini ("Nano Banana") with a creative-edit prompt — used
// when REPLICATE_API_TOKEN is missing or upscaling fails. Gemini is
// great at recoloring/brightening but less reliable for upscaling.

import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { b2, bucket, decodeFileId, publicUrl } from "@/lib/b2";
import { enhanceImage, ENHANCE_PROMPT_DEFAULT } from "@/lib/gemini";
import { upscaleImage } from "@/lib/replicate";
import { applyToneGrade } from "@/lib/tone-grade";
import { getSession } from "@/lib/session";
import { canAccessKey } from "@/lib/access";

export const maxDuration = 60;

interface RequestBody {
  fileId: string;
  imageUrl?: string;
  imageBase64?: string;
  prompt?: string;
  label?: string;
  // Force a specific engine — defaults to "auto"
  engine?: "auto" | "upscale" | "gemini";
}

async function fetchInput(imageUrl?: string, imageBase64?: string) {
  if (imageBase64) {
    return { base64: imageBase64, mime: "image/jpeg" };
  }
  if (!imageUrl) throw new Error("no source");
  const r = await fetch(imageUrl);
  if (!r.ok) throw new Error(`source fetch ${r.status}`);
  const mime = r.headers.get("content-type") ?? "image/jpeg";
  const buf = Buffer.from(await r.arrayBuffer());
  return { base64: buf.toString("base64"), mime };
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
  if (!canAccessKey(user, key)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const hasReplicate = !!process.env.REPLICATE_API_TOKEN;
  const engine = body.engine ?? "auto";

  // Pick the path
  const tryUpscaleFirst = engine === "upscale" || (engine === "auto" && hasReplicate);
  const errors: string[] = [];

  // ---------- Real-ESRGAN path ----------
  if (tryUpscaleFirst) {
    try {
      // Replicate needs a public URL; if we got base64, we'd need to
      // upload it first. For simplicity, only run upscale when we have
      // a URL (which is what ThumbnailStudio always passes).
      if (body.imageUrl) {
        const upscaled = await upscaleImage({
          imageUrl: body.imageUrl,
          scale: 4,
          faceEnhance: true,
        });
        // Apply a graphics-grade tone curve on top of the upscale:
        // crushes blacks ~10/255, lifts brightness slope ~12%, and
        // boosts saturation ~12%. This is what gives thumbnails that
        // "punchy video graphic" look — Real-ESRGAN alone is sharper
        // but flat.
        let graded: { buf: Buffer; mime: string };
        try {
          graded = await applyToneGrade(upscaled.buf);
        } catch (err) {
          // If sharp throws for some reason, fall back to the raw upscale
          console.error("[enhance] tone-grade failed", err);
          graded = upscaled;
        }
        const ext = graded.mime.includes("png") ? "png" : "jpg";
        const label = (body.label ?? "enhanced").replace(/[^\w-]/g, "");
        const outKey = `${key}.${label}.${ext}`;
        await b2.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: outKey,
            Body: graded.buf,
            ContentType: graded.mime,
            CacheControl: "public, max-age=3600",
          }),
        );
        return NextResponse.json({
          url: publicUrl(outKey),
          key: outKey,
          engine: "real-esrgan+grade",
          mimeType: graded.mime,
        });
      } else {
        errors.push("upscale: no public URL (got base64 only)");
      }
    } catch (err) {
      errors.push(`upscale: ${(err as Error).message}`);
    }
    if (engine === "upscale") {
      return NextResponse.json(
        { error: "upscale_failed", message: errors.join(" · ") },
        { status: 500 },
      );
    }
    // engine === "auto" → fall through to Gemini
  }

  // ---------- Gemini path ----------
  try {
    const { base64, mime } = await fetchInput(body.imageUrl, body.imageBase64);
    const enhanced = await enhanceImage(
      base64,
      mime,
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
      engine: "gemini",
      mimeType: enhanced.mimeType,
      ...(errors.length ? { upscaleErrors: errors } : {}),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "enhance_error",
        message: (err as Error).message,
        ...(errors.length ? { upscaleErrors: errors } : {}),
      },
      { status: 500 },
    );
  }
}
