// In-process job state for the AI transcription pipeline.
// Acceptable in dev (single Node process). For serverless prod this needs to
// move to Redis / Durable Objects / a real queue (Inngest, Cloud Tasks).

export type JobStage =
  | "queued"
  | "transcribing"
  | "generating"
  | "ready"
  | "error";

export interface JobState {
  videoKey: string;
  stage: JobStage;
  progress: number;
  startedAt: number;
  finishedAt?: number;
  error?: string;
}

const jobs = new Map<string, JobState>();

export function getJob(videoKey: string): JobState | undefined {
  return jobs.get(videoKey);
}

export function setJob(videoKey: string, state: Partial<JobState>): JobState {
  const existing = jobs.get(videoKey);
  const next: JobState = {
    videoKey,
    stage: "queued",
    progress: 0,
    startedAt: Date.now(),
    ...existing,
    ...state,
  };
  jobs.set(videoKey, next);
  return next;
}

export function clearJob(videoKey: string): void {
  jobs.delete(videoKey);
}

export function deriveProgress(stage: JobStage, elapsedMs: number): number {
  // Smooth a "moving target" estimate so the UI doesn't sit at one number for minutes.
  if (stage === "queued") return 1;
  if (stage === "transcribing") {
    // Transcription tends to take 1-5 min. Climb from 5 to 70 over ~3 minutes.
    const t = Math.min(1, elapsedMs / (3 * 60 * 1000));
    return Math.round(5 + 65 * t);
  }
  if (stage === "generating") return 80;
  if (stage === "ready") return 100;
  if (stage === "error") return 0;
  return 0;
}
