// Postgres-backed OpusClip job tracking.

import { eq } from "drizzle-orm";
import { db } from "./db";
import { opusJobs } from "./db/schema";

export interface OpusJobRecord {
  jobId: string;
  userId: string;
  videoKey: string;
  projectId: string;
  stylePreset: string;
  startedAt: number;
  finishedAt?: number;
  status: "queued" | "processing" | "succeeded" | "failed";
  clipsDelivered: number;
  error?: string;
}

type DbRow = typeof opusJobs.$inferSelect;

function toRecord(r: DbRow): OpusJobRecord {
  return {
    jobId: r.jobId,
    userId: r.userId,
    videoKey: r.videoKey,
    projectId: r.projectId ?? "",
    stylePreset: r.stylePreset,
    startedAt: r.startedAt.getTime(),
    finishedAt: r.finishedAt ? r.finishedAt.getTime() : undefined,
    status: r.status,
    clipsDelivered: r.clipsDelivered,
    error: r.error ?? undefined,
  };
}

export async function recordJob(job: OpusJobRecord): Promise<void> {
  await db
    .insert(opusJobs)
    .values({
      jobId: job.jobId,
      userId: job.userId,
      videoKey: job.videoKey,
      projectId: job.projectId || null,
      stylePreset: job.stylePreset,
      status: job.status,
      clipsDelivered: job.clipsDelivered,
      error: job.error ?? null,
      startedAt: new Date(job.startedAt),
      finishedAt: job.finishedAt ? new Date(job.finishedAt) : null,
    })
    .onConflictDoNothing({ target: opusJobs.jobId });
}

export async function updateJob(
  jobId: string,
  patch: Partial<OpusJobRecord>,
): Promise<void> {
  const dbPatch: Partial<typeof opusJobs.$inferInsert> = {};
  if (patch.status !== undefined) dbPatch.status = patch.status;
  if (patch.clipsDelivered !== undefined) dbPatch.clipsDelivered = patch.clipsDelivered;
  if (patch.error !== undefined) dbPatch.error = patch.error;
  if (patch.finishedAt !== undefined) dbPatch.finishedAt = new Date(patch.finishedAt);
  if (Object.keys(dbPatch).length === 0) return;
  await db.update(opusJobs).set(dbPatch).where(eq(opusJobs.jobId, jobId));
}

export async function getJob(jobId: string): Promise<OpusJobRecord | null> {
  const [r] = await db.select().from(opusJobs).where(eq(opusJobs.jobId, jobId)).limit(1);
  return r ? toRecord(r) : null;
}

export async function jobsForFile(videoKey: string): Promise<OpusJobRecord[]> {
  const rows = await db.select().from(opusJobs).where(eq(opusJobs.videoKey, videoKey));
  return rows.map(toRecord);
}
