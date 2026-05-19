// Tracks OpusClip jobs we've kicked off so we can poll status.
// app/data/opus-jobs.json (gitignored).

import fs from "fs/promises";
import path from "path";

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

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "opus-jobs.json");

async function read(): Promise<OpusJobRecord[]> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as OpusJobRecord[];
  } catch {
    return [];
  }
}

async function write(rows: OpusJobRecord[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(rows, null, 2));
}

export async function recordJob(job: OpusJobRecord): Promise<void> {
  const rows = await read();
  rows.unshift(job);
  await write(rows);
}

export async function updateJob(
  jobId: string,
  patch: Partial<OpusJobRecord>,
): Promise<void> {
  const rows = await read();
  const i = rows.findIndex((r) => r.jobId === jobId);
  if (i < 0) return;
  rows[i] = { ...rows[i], ...patch };
  await write(rows);
}

export async function getJob(jobId: string): Promise<OpusJobRecord | null> {
  const rows = await read();
  return rows.find((r) => r.jobId === jobId) ?? null;
}

export async function jobsForFile(videoKey: string): Promise<OpusJobRecord[]> {
  const rows = await read();
  return rows.filter((r) => r.videoKey === videoKey);
}
