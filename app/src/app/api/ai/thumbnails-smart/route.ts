import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { b2, bucket, decodeFileId, publicUrl } from "@/lib/b2";
import { composeThumbnail, pickThumbnailsFromContext } from "@/lib/gemini";
import { overlayTitle } from "@/lib/thumbnail-overlay";
import { getAI, getTranscript } from "@/lib/transcript-store";
import { getSession } from "@/lib/session";

// Designing 3 thumbnails (each an image-model call with retries) can take a
// while — give it room beyond the default function timeout.
export const maxDuration = 300;

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

  // Transcript is keyed by the B2 path (videoKey == backblaze key).
  const transcript = await getTranscript(key);
  if (!transcript || !transcript.transcript.trim()) {
    return NextResponse.json(
      {
        error: "no_transcript",
        message:
          "This episode has no transcript yet. Run transcription first, then try smart picks.",
      },
      { status: 400 },
    );
  }
  const ai = await getAI(key);

  try {
    const picks = await pickThumbnailsFromContext(
      body.framesBase64,
      transcript.transcript,
      ai?.title,
    );
    if (picks.length === 0) {
      return NextResponse.json(
        { error: "no_picks", message: "Gemini returned no usable picks" },
        { status: 500 },
      );
    }

    // Design all 3 in parallel: enhance the frame + render the title into a
    // finished thumbnail. If one design fails, fall back to the raw frame so
    // we always return the pick; track errors so we can surface a real
    // failure (e.g. billing off) when EVERY design fails.
    const designErrors: string[] = [];
    const results = await Promise.all(
      picks.map(async (p) => {
        const frame = body.framesBase64[p.index];
        if (!frame) return null;
        const label = `smart-${p.rank}`;
        const thumbKey = `${key}.thumb-${label}.jpg`;

        let bodyBuf: Uint8Array = Buffer.from(frame, "base64");
        let contentType = "image/jpeg";
        let designed = false;
        const title = (p.headline || ai?.title || "").trim();
        if (title) {
          try {
            // Preferred: Gemini draws the stylized title into the image.
            const out = await composeThumbnail(frame, title);
            bodyBuf = Buffer.from(out.base64, "base64");
            contentType = out.mimeType || "image/png";
            designed = true;
          } catch (err) {
            designErrors.push((err as Error).message);
            // Fallback: composite a real-font title onto the raw frame so a
            // title is ALWAYS present (e.g. when Gemini image billing is off).
            try {
              bodyBuf = await overlayTitle(Buffer.from(frame, "base64"), title);
              contentType = "image/jpeg";
              designed = true;
            } catch (overlayErr) {
              designErrors.push(`overlay: ${(overlayErr as Error).message}`);
            }
          }
        }

        await b2.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: thumbKey,
            Body: bodyBuf,
            ContentType: contentType,
            CacheControl: "public, max-age=3600",
          }),
        );
        return {
          label,
          url: publicUrl(thumbKey),
          reason: p.reason,
          headline: p.headline,
          designed,
          key: thumbKey,
        };
      }),
    );

    const thumbnails = results.filter((r): r is NonNullable<typeof r> => r !== null);
    // Every pick failed to design (and a title existed) → real problem worth
    // surfacing rather than silently handing back plain frames.
    if (thumbnails.length > 0 && thumbnails.every((t) => !t.designed) && designErrors.length > 0) {
      return NextResponse.json(
        { error: "design_failed", message: designErrors[0], thumbnails },
        { status: 502 },
      );
    }
    // Recovered via the font-overlay fallback — let the UI mention it.
    const usedFallback = designErrors.length > 0 && thumbnails.some((t) => t.designed);
    return NextResponse.json({
      thumbnails,
      ...(usedFallback
        ? { note: "AI image styling was unavailable, so titles were added with a clean font overlay." }
        : {}),
    });
  } catch (err) {
    return NextResponse.json(
      { error: "gemini_error", message: (err as Error).message },
      { status: 500 },
    );
  }
}
