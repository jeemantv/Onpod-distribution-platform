import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { b2, bucket, decodeFileId, publicUrl } from "@/lib/b2";
import {
  ENHANCE_PROMPT_DEFAULT,
  THUMBNAIL_STYLE_NAMES,
  enhanceImage,
  pickThumbnailsFromContext,
} from "@/lib/gemini";
import { overlayTitle, parseStyleNotes } from "@/lib/thumbnail-overlay";
import { removeBackgroundBuffer } from "@/lib/remove-bg";
import { getAI, getTranscript } from "@/lib/transcript-store";
import { getSession } from "@/lib/session";

// Designing 3 thumbnails (each an image-model call with retries) can take a
// while — give it room beyond the default function timeout.
export const maxDuration = 300;

// Map the model's placement words to the overlay's Side names.
const WORD_TO_SIDE = { top: "top", bottom: "bottom", left: "leftMid", right: "rightMid" } as const;

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

    // Pipeline per pick (all 3 in parallel):
    //   1. Enhance the frame for quality (Gemini, best-effort).
    //   2. Cut the people out (remove.bg, best-effort).
    //   3. Draw the title with a real font in the empty area, then layer the
    //      people back on top → the title sits BEHIND their heads.
    // Steps 1 & 2 degrade gracefully; the font title (step 3) always runs.
    let enhanceFailed = false;
    let cutoutFailed = false;
    const results = await Promise.all(
      picks.map(async (p, i) => {
        const frame = body.framesBase64[p.index];
        if (!frame) return null;
        const style = i % THUMBNAIL_STYLE_NAMES.length; // distinct look per pick
        const styleName = THUMBNAIL_STYLE_NAMES[style];
        const label = `smart-${p.rank}`;
        const thumbKey = `${key}.thumb-${label}.jpg`;
        const title = (p.headline || ai?.title || "").trim();

        // Effective placement: explicit user note wins; else the model's
        // per-frame "empty space, no face" placement.
        const pickOverride = {
          color: overlayOverride.color,
          placement:
            overlayOverride.placement ?? (p.placement ? WORD_TO_SIDE[p.placement] : undefined),
        };

        // 1. Enhance (quality). Falls back to the raw frame.
        let baseBuf = Buffer.from(frame, "base64");
        try {
          const enh = await enhanceImage(frame, "image/jpeg", ENHANCE_PROMPT_DEFAULT);
          baseBuf = Buffer.from(enh.base64, "base64");
        } catch {
          enhanceFailed = true;
        }

        // 2. Cut out the people so the title can go behind them.
        let foreground: Buffer | undefined;
        try {
          foreground = await removeBackgroundBuffer(baseBuf);
        } catch {
          cutoutFailed = true;
        }

        // 3. Deterministic font title behind the heads.
        const bodyBuf = await overlayTitle(baseBuf, title, style, pickOverride, foreground);

        await b2.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: thumbKey,
            Body: bodyBuf,
            ContentType: "image/jpeg",
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
          key: thumbKey,
        };
      }),
    );

    const thumbnails = results.filter((r): r is NonNullable<typeof r> => r !== null);
    const notesOut: string[] = [];
    if (cutoutFailed)
      notesOut.push("couldn't cut out the people, so the title sits beside them");
    if (enhanceFailed) notesOut.push("AI quality enhance was unavailable");
    return NextResponse.json({
      thumbnails,
      ...(notesOut.length ? { note: `Heads up: ${notesOut.join("; ")}.` } : {}),
    });
  } catch (err) {
    return NextResponse.json(
      { error: "gemini_error", message: (err as Error).message },
      { status: 500 },
    );
  }
}
