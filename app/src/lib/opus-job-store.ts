// OpusClip job tracking, backed by B2 (serverless-safe).

import { readState, writeState } from "./state-store";

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

const KEY = "opus-jobs.json";

async function readAll(): Promise<OpusJobRecord[]> {
  return readState<OpusJobRecord[]>(KEY, []);
}

async function writeAll(rows: OpusJobRecord[]): Promise<void> {
  await writeState(KEY, rows);
}

export async function recordJob(job: OpusJobRecord): Promise<void> {
  const rows = await readAll();
  rows.unshift(job);
  await writeAll(rows);
}

export async function updateJob(
  jobId: string,
  patch: Partial<OpusJobRecord>,
): Promise<void> {
  const rows = await readAll();
  const i = rows.findIndex((r) => r.jobId === jobId);
  if (i < 0) return;
  rows[i] = { ...rows[i], ...patch };
  await writeAll(rows);
}

export async function getJob(jobId: string): Promise<OpusJobRecord | null> {
  const rows = await readAll();
  return rows.find((r) => r.jobId === jobId) ?? null;
}

export async function jobsForFile(videoKey: string): Promise<OpusJobRecord[]> {
  const rows = await readAll();
  return rows.filter((r) => r.videoKey === videoKey);
}
