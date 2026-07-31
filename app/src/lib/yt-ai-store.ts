// Storage for the AI YouTube admin tool. One row per link processed.

import { desc, eq } from "drizzle-orm";
import { db } from "./db";
import { ytAiJobs, type YtAiJob } from "./db/schema";
import type { AIPackage } from "./claude";

export type { YtAiJob };

export interface ThumbnailOut {
  url: string;
  headline: string;
  reason: string;
  style: string;
  designed: boolean;
}

export async function createJob(args: {
  userId: string;
  videoId: string;
  url: string;
  videoTitle: string;
  channel: string;
  coverUrl: string;
}): Promise<YtAiJob> {
  const [row] = await db
    .insert(ytAiJobs)
    .values({
      userId: args.userId,
      videoId: args.videoId,
      url: args.url,
      videoTitle: args.videoTitle || null,
      channel: args.channel || null,
      coverUrl: args.coverUrl || null,
    })
    .returning();
  return row;
}

export async function getJob(id: string): Promise<YtAiJob | null> {
  const [row] = await db.select().from(ytAiJobs).where(eq(ytAiJobs.id, id)).limit(1);
  return row ?? null;
}

export async function listJobs(userId: string, limit = 25): Promise<YtAiJob[]> {
  return db
    .select()
    .from(ytAiJobs)
    .where(eq(ytAiJobs.userId, userId))
    .orderBy(desc(ytAiJobs.createdAt))
    .limit(limit);
}

export async function deleteJob(id: string): Promise<void> {
  await db.delete(ytAiJobs).where(eq(ytAiJobs.id, id));
}

/** Append one transcribed window and record how far we got. */
export async function appendTranscript(
  id: string,
  chunk: string,
  segmentsDone: number,
  complete: boolean,
): Promise<YtAiJob | null> {
  const job = await getJob(id);
  if (!job) return null;
  const existing = job.transcript ?? "";
  const merged = chunk.trim()
    ? existing
      ? `${existing.trimEnd()}\n${chunk.trim()}`
      : chunk.trim()
    : existing;
  const [row] = await db
    .update(ytAiJobs)
    .set({
      transcript: merged,
      segmentsDone,
      transcriptComplete: complete,
      updatedAt: new Date(),
    })
    .where(eq(ytAiJobs.id, id))
    .returning();
  return row ?? null;
}

/**
 * Replace the transcript wholesale — used by the caption import, which gets
 * the entire thing in one shot instead of window by window.
 */
export async function setTranscript(
  id: string,
  transcript: string,
  info?: { videoTitle?: string; channel?: string; coverUrl?: string },
): Promise<YtAiJob | null> {
  const [row] = await db
    .update(ytAiJobs)
    .set({
      transcript,
      segmentsDone: 0,
      transcriptComplete: true,
      ...(info?.videoTitle ? { videoTitle: info.videoTitle } : {}),
      ...(info?.channel ? { channel: info.channel } : {}),
      ...(info?.coverUrl ? { coverUrl: info.coverUrl } : {}),
      updatedAt: new Date(),
    })
    .where(eq(ytAiJobs.id, id))
    .returning();
  return row ?? null;
}

/** Wipe transcript progress so a run can start over. */
export async function resetTranscript(id: string): Promise<void> {
  await db
    .update(ytAiJobs)
    .set({ transcript: null, segmentsDone: 0, transcriptComplete: false, updatedAt: new Date() })
    .where(eq(ytAiJobs.id, id));
}

export async function saveAI(id: string, ai: AIPackage): Promise<YtAiJob | null> {
  const [row] = await db
    .update(ytAiJobs)
    .set({ ai, updatedAt: new Date() })
    .where(eq(ytAiJobs.id, id))
    .returning();
  return row ?? null;
}

export async function saveArticle(
  id: string,
  format: string,
  markdown: string,
): Promise<YtAiJob | null> {
  const job = await getJob(id);
  if (!job) return null;
  const [row] = await db
    .update(ytAiJobs)
    .set({
      articles: { ...(job.articles ?? {}), [format]: markdown },
      updatedAt: new Date(),
    })
    .where(eq(ytAiJobs.id, id))
    .returning();
  return row ?? null;
}

export async function saveThumbnails(
  id: string,
  thumbnails: ThumbnailOut[],
): Promise<YtAiJob | null> {
  const [row] = await db
    .update(ytAiJobs)
    .set({ thumbnails, updatedAt: new Date() })
    .where(eq(ytAiJobs.id, id))
    .returning();
  return row ?? null;
}
