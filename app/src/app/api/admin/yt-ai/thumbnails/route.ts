import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { b2, bucket, publicUrl } from "@/lib/b2";
import { THUMBNAIL_STYLE_NAMES, composeThumbnail } from "@/lib/gemini";
import { overlayTitle, parseStyleNotes } from "@/lib/thumbnail-overlay";
import { fetchYouTubeStill, thumbnailIdeas } from "@/lib/youtube-ai";
import { saveThumbnails, type ThumbnailOut } from "@/lib/yt-ai-store";
import { errorJson, isResponse, loadOwnedJob, requireAdminApi } from "../_shared";

// Three image-model calls with retries.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Unlike the session flow — which picks the best frame out of a video we host —
// we can't pull frames out of someone else's YouTube video, so the cover image
// YouTube already serves is the base plate. The headlines still come from the
// transcript, so the text is about THIS episode.
export async function POST(req: Request) {
  const user = requireAdminApi();
  if (isResponse(user)) return user;

  const { jobId, stylePrompt, redo } = (await req.json()) as {
    jobId?: string;
    stylePrompt?: string;
    redo?: boolean;
  };
  const job = await loadOwnedJob(jobId ?? "", user.id);
  if (isResponse(job)) return job;

  const transcript = (job.transcript ?? "").trim();
  if (!transcript) {
    return NextResponse.json(
      { error: "no_transcript", message: "Transcribe the video first." },
      { status: 409 },
    );
  }

  const notes = (stylePrompt ?? "").trim().slice(0, 300);
  const overlayOverride = parseStyleNotes(notes);
  const stamp = Date.now();

  try {
    const still = await fetchYouTubeStill(job.videoId, job.coverUrl ?? undefined);
    const ideas = await thumbnailIdeas(
      transcript,
      job.ai?.title || job.videoTitle || "",
      redo
        ? "This is a RE-ROLL — write DIFFERENT, fresher headlines than the most obvious angle."
        : undefined,
    );
    if (ideas.length === 0) {
      return NextResponse.json(
        { error: "no_ideas", message: "Gemini returned no headline ideas. Try again." },
        { status: 502 },
      );
    }

    const designErrors: string[] = [];
    const results = await Promise.all(
      ideas.map(async (idea, i): Promise<ThumbnailOut> => {
        const style = i % THUMBNAIL_STYLE_NAMES.length;
        const key = `admin/yt-ai/${job.id}/thumb-${i + 1}.jpg`;
        let body: Uint8Array = Buffer.from(still, "base64");
        let contentType = "image/jpeg";
        let designed = false;
        try {
          const out = await composeThumbnail(
            still,
            idea.headline,
            style,
            notes,
            overlayOverride.placement === "leftMid"
              ? "left"
              : overlayOverride.placement === "rightMid"
                ? "right"
                : overlayOverride.placement,
          );
          body = Buffer.from(out.base64, "base64");
          contentType = out.mimeType || "image/png";
          designed = true;
        } catch (err) {
          designErrors.push((err as Error).message);
          // Fall back to a real-font overlay so a titled thumbnail still lands.
          try {
            body = await overlayTitle(Buffer.from(still, "base64"), idea.headline, style, overlayOverride);
            designed = true;
          } catch (overlayErr) {
            designErrors.push(`overlay: ${(overlayErr as Error).message}`);
          }
        }

        await b2.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: body,
            ContentType: contentType,
            CacheControl: "public, max-age=3600",
          }),
        );
        return {
          // The key is overwritten in place on a re-roll, so cache-bust the URL.
          url: `${publicUrl(key)}&v=${stamp}`,
          headline: idea.headline,
          reason: idea.reason,
          style: THUMBNAIL_STYLE_NAMES[style],
          designed,
        };
      }),
    );

    await saveThumbnails(job.id, results);
    const usedFallback = designErrors.length > 0 && results.some((t) => t.designed);
    return NextResponse.json({
      thumbnails: results,
      ...(usedFallback
        ? { note: "AI image styling was unavailable, so titles were added with a clean font overlay." }
        : {}),
    });
  } catch (err) {
    return errorJson(err);
  }
}
