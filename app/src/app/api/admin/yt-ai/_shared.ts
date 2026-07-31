import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getJob, type YtAiJob } from "@/lib/yt-ai-store";
import type { User } from "@/lib/types";

/** AI YouTube is a super-admin tool — editors and clients never see it. */
export function requireAdminApi(): User | NextResponse {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.guest || user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return user;
}

export function isResponse(v: unknown): v is NextResponse {
  return v instanceof NextResponse;
}

/** Load a job and confirm it belongs to the caller. */
export async function loadOwnedJob(
  jobId: string,
  userId: string,
): Promise<YtAiJob | NextResponse> {
  if (!jobId) return NextResponse.json({ error: "missing_job_id" }, { status: 400 });
  const job = await getJob(jobId);
  if (!job) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (job.userId !== userId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return job;
}

export function errorJson(err: unknown, status = 500): NextResponse {
  return NextResponse.json(
    { error: "failed", message: (err as Error).message ?? String(err) },
    { status },
  );
}
