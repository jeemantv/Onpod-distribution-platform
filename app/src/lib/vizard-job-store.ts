// Postgres-backed Vizard clip job tracking. Mirrors opus-job-store but
// keyed by Vizard's projectId.

import { eq } from "drizzle-orm";
import { db } from "./db";
import { vizardJobs } from "./db/schema";

export interface VizardJobRecord {
  projectId: string;
  userId: string;
  videoKey: string;
  sessionContext: string | null;
  preferLength: number;
  status: "queued" | "processing" | "succeeded" | "failed";
  clipsDelivered: number;
  error: string | null;
  startedAt: number;
  finishedAt: number | null;
}

type DbRow = typeof vizardJobs.$inferSelect;

function toRecord(r: DbRow): VizardJobRecord {
  return {
    projectId: r.projectId,
    userId: r.userId,
    videoKey: r.videoKey,
    sessionContext: r.sessionContext ?? null,
    preferLength: r.preferLength,
    status: r.status,
    clipsDelivered: r.clipsDelivered,
    error: r.error ?? null,
    startedAt: r.startedAt.getTime(),
    finishedAt: r.finishedAt ? r.finishedAt.getTime() : null,
  };
}

export async function recordVizardJob(job: VizardJobRecord): Promise<void> {
  await db
    .insert(vizardJobs)
    .values({
      projectId: job.projectId,
      userId: job.userId,
      videoKey: job.videoKey,
      sessionContext: job.sessionContext,
      preferLength: job.preferLength,
      status: job.status,
      clipsDelivered: job.clipsDelivered,
      error: job.error,
      startedAt: new Date(job.startedAt),
      finishedAt: job.finishedAt ? new Date(job.finishedAt) : null,
    })
    .onConflictDoNothing({ target: vizardJobs.projectId });
}

export async function updateVizardJob(
  projectId: string,
  patch: Partial<VizardJobRecord>,
): Promise<void> {
  const dbPatch: Partial<typeof vizardJobs.$inferInsert> = {};
  if (patch.status !== undefined) dbPatch.status = patch.status;
  if (patch.clipsDelivered !== undefined) dbPatch.clipsDelivered = patch.clipsDelivered;
  if (patch.error !== undefined) dbPatch.error = patch.error;
  if (patch.finishedAt !== undefined && patch.finishedAt !== null) {
    dbPatch.finishedAt = new Date(patch.finishedAt);
  }
  if (Object.keys(dbPatch).length === 0) return;
  await db.update(vizardJobs).set(dbPatch).where(eq(vizardJobs.projectId, projectId));
}

export async function getVizardJob(projectId: string): Promise<VizardJobRecord | null> {
  const [r] = await db
    .select()
    .from(vizardJobs)
    .where(eq(vizardJobs.projectId, projectId))
    .limit(1);
  return r ? toRecord(r) : null;
}

export async function vizardJobsForFile(videoKey: string): Promise<VizardJobRecord[]> {
  const rows = await db
    .select()
    .from(vizardJobs)
    .where(eq(vizardJobs.videoKey, videoKey));
  return rows.map(toRecord);
}
