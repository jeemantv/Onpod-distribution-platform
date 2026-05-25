// Postgres-backed transcript + AI content storage.
//
// The suffix exports are retained because some admin UI code still derives
// B2 lookup paths from them — even though storage has moved to PG.

import { eq } from "drizzle-orm";
import { db } from "./db";
import { aiContent, transcriptJobs, transcripts } from "./db/schema";
import type { DeepgramResult } from "./deepgram";
import type { AIPackage } from "./claude";

export const TRANSCRIPT_SUFFIX = ".transcript.json";
export const AI_SUFFIX = ".ai.json";
export const JOB_SUFFIX = ".job.json";

export interface JobMarker {
  videoKey: string;
  startedAt: number;
  stage: "transcribing" | "generating";
  requestId?: string;
  error?: string;
}

export function transcriptKey(videoKey: string): string {
  return videoKey + TRANSCRIPT_SUFFIX;
}
export function aiKey(videoKey: string): string {
  return videoKey + AI_SUFFIX;
}
export function jobKey(videoKey: string): string {
  return videoKey + JOB_SUFFIX;
}

// ---------- Existence checks ----------

export async function hasTranscript(videoKey: string): Promise<boolean> {
  const [r] = await db
    .select({ id: transcripts.id })
    .from(transcripts)
    .where(eq(transcripts.videoKey, videoKey))
    .limit(1);
  return !!r;
}

export async function hasAI(videoKey: string): Promise<boolean> {
  const [r] = await db
    .select({ id: aiContent.id })
    .from(aiContent)
    .where(eq(aiContent.videoKey, videoKey))
    .limit(1);
  return !!r;
}

// ---------- Transcript ----------

export async function getTranscript(videoKey: string): Promise<DeepgramResult | null> {
  const [r] = await db.select().from(transcripts).where(eq(transcripts.videoKey, videoKey)).limit(1);
  if (!r) return null;
  // Reconstruct the original Deepgram payload from the persisted columns.
  return {
    transcript: r.text,
    language: r.language ?? "en",
    paragraphs: (r.paragraphsJson ?? []) as DeepgramResult["paragraphs"],
    requestId: r.deepgramRequestId ?? undefined,
  } as DeepgramResult;
}

export async function saveTranscript(videoKey: string, result: DeepgramResult): Promise<void> {
  await db
    .insert(transcripts)
    .values({
      videoKey,
      text: result.transcript,
      source: "deepgram",
      deepgramRequestId: result.requestId ?? null,
      language: result.language ?? null,
      paragraphsJson: result.paragraphs ?? null,
    })
    .onConflictDoUpdate({
      target: transcripts.videoKey,
      set: {
        text: result.transcript,
        deepgramRequestId: result.requestId ?? null,
        language: result.language ?? null,
        paragraphsJson: result.paragraphs ?? null,
      },
    });
}

// ---------- AI content ----------

export async function getAI(videoKey: string): Promise<AIPackage | null> {
  const [r] = await db.select().from(aiContent).where(eq(aiContent.videoKey, videoKey)).limit(1);
  if (!r) return null;
  return {
    title: r.title ?? "",
    description: r.description ?? "",
    chapters: r.chapters ?? "",
    tags: r.tags ?? [],
    hashtags: r.hashtags ?? [],
    language: r.language ?? "",
    summary: r.summary ?? "",
  };
}

export async function saveAI(videoKey: string, ai: AIPackage): Promise<void> {
  // `articlesJson` is reserved for per-format articles (§6.6); current
  // AIPackage doesn't carry them yet so we leave the column untouched on
  // updates and default to {} on insert.
  await db
    .insert(aiContent)
    .values({
      videoKey,
      title: ai.title,
      description: ai.description,
      chapters: ai.chapters,
      tags: ai.tags,
      hashtags: ai.hashtags,
      language: ai.language,
      summary: ai.summary,
      articlesJson: {},
    })
    .onConflictDoUpdate({
      target: aiContent.videoKey,
      set: {
        title: ai.title,
        description: ai.description,
        chapters: ai.chapters,
        tags: ai.tags,
        hashtags: ai.hashtags,
        language: ai.language,
        summary: ai.summary,
        updatedAt: new Date(),
      },
    });
}

// ---------- Job markers ----------

export async function getJobMarker(videoKey: string): Promise<JobMarker | null> {
  const [r] = await db
    .select()
    .from(transcriptJobs)
    .where(eq(transcriptJobs.videoKey, videoKey))
    .limit(1);
  if (!r) return null;
  return {
    videoKey: r.videoKey,
    startedAt: r.startedAt.getTime(),
    stage: r.stage,
    requestId: r.requestId ?? undefined,
    error: r.error ?? undefined,
  };
}

export async function setJobMarker(marker: JobMarker): Promise<void> {
  await db
    .insert(transcriptJobs)
    .values({
      videoKey: marker.videoKey,
      stage: marker.stage,
      requestId: marker.requestId ?? null,
      error: marker.error ?? null,
      startedAt: new Date(marker.startedAt),
    })
    .onConflictDoUpdate({
      target: transcriptJobs.videoKey,
      set: {
        stage: marker.stage,
        requestId: marker.requestId ?? null,
        error: marker.error ?? null,
        updatedAt: new Date(),
      },
    });
}

export async function clearJobMarker(videoKey: string): Promise<void> {
  await db.delete(transcriptJobs).where(eq(transcriptJobs.videoKey, videoKey));
}
