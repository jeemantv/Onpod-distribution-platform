import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { b2, bucket, decodeFileId, publicUrl } from "@/lib/b2";
import { THUMBNAIL_STYLE_NAMES, composeThumbnail, pickThumbnailsFromContext } from "@/lib/gemini";
import { overlayTitle, parseStyleNotes } from "@/lib/thumbnail-overlay";
import { getAI, getTranscript } from "@/lib/transcript-store";
import { getSession } from "@/lib/session";

// Designing 3 thumbnails (each an image-model call with retries) can take a
// while — give it room beyond the default function timeout.
export const maxDuration = 300;

// Convert between the model's placement words and the overlay's Side names.
const WORD_TO_SIDE = { top: "top", bottom: "bottom", left: "leftMid", right: "rightMid" } as const;
const SIDE_TO_WORD = { top: "top", bottom: "bottom", leftMid: "left", rightMid: "right" } as const;

interface RequestBody {
  fileId: string;
  framesBase64: string[]; // each is a base64 JPEG (no data: prefix)
  // Optional free-text design direction from the user (e.g. "red text",
  // "darker background", "title at the bottom").
  stylePrompt?: string;
  // True when this is a "Redo" — pushes the picker to vary frames/titles.
  redo?: boolean;
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
  const stamp = Date.now();
  const notes = (body.stylePrompt ?? "").trim().slice(0, 300);
  // Same notes drive the font-overlay fallback's colour + placement.
  const overlayOverride = parseStyleNotes(notes);
  const variationHint = body.redo
    ? "This is a RE-ROLL — deliberately pick DIFFERENT frames and write DIFFERENT, fresh titles than the most obvious choice. Explore new angles, expressions, and hooks."
    : undefined;

  try {
    const picks = await pickThumbnailsFromContext(
      body.framesBase64,
      transcript.transcript,
      ai?.title,
      variationHint,
    );
    if (picks.length === 0) {
      return NextResponse.json(
        { error: "no_picks", message: "Gemini returned no usable picks" },
        { status: 500 },
      );
    }

    // Design all 3 in parallel. Preferred: Gemini draws the styled title into
    // the (enhanced) image directly — this is what produces the good-looking
    // thumbnails. If that call fails (e.g. image billing off), fall back to a
    // clean real-font title overlay so a titled thumbnail is still returned.
    const designErrors: string[] = [];
    const results = await Promise.all(
      picks.map(async (p, i) => {
        const frame = body.framesBase64[p.index];
        if (!frame) return null;
        const style = i % THUMBNAIL_STYLE_NAMES.length; // distinct look per pick
        const styleName = THUMBNAIL_STYLE_NAMES[style];
        const label = `smart-${p.rank}`;
        const thumbKey = `${key}.thumb-${label}.jpg`;
        const title = (p.headline || ai?.title || "").trim();

        // Where the title should sit (off the faces): explicit user note wins,
        // else the model's per-frame placement.
        const placeWord =
          (overlayOverride.placement ? SIDE_TO_WORD[overlayOverride.placement] : undefined) ??
          p.placement;
        const pickOverride = {
          color: overlayOverride.color,
          placement:
            overlayOverride.placement ?? (p.placement ? WORD_TO_SIDE[p.placement] : undefined),
        };

        let bodyBuf: Uint8Array = Buffer.from(frame, "base64");
        let contentType = "image/jpeg";
        let designed = false;
        if (title) {
          try {
            const out = await composeThumbnail(frame, title, style, notes, placeWord);
            bodyBuf = Buffer.from(out.base64, "base64");
            contentType = out.mimeType || "image/png";
            designed = true;
          } catch (err) {
            designErrors.push((err as Error).message);
            try {
              bodyBuf = await overlayTitle(Buffer.from(frame, "base64"), title, style, pickOverride);
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
          // Cache-bust: the key is overwritten in place, so without a unique
          // query the browser/CDN would keep showing the previous image.
          url: `${publicUrl(thumbKey)}?v=${stamp}`,
          reason: p.reason,
          headline: p.headline,
          style: styleName,
          designed,
          key: thumbKey,
        };
      }),
    );

    const thumbnails = results.filter((r): r is NonNullable<typeof r> => r !== null);
    if (thumbnails.length > 0 && thumbnails.every((t) => !t.designed) && designErrors.length > 0) {
      return NextResponse.json(
        { error: "design_failed", message: designErrors[0], thumbnails },
        { status: 502 },
      );
    }
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
