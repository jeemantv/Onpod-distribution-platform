import { NextResponse } from "next/server";
import { getJob as getStoredJob, updateJob } from "@/lib/opus-job-store";
import { getJob as fetchOpusJob } from "@/lib/opusclip";
import { getSession } from "@/lib/session";

export async function GET(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ error: "missing_jobId" }, { status: 400 });

  const stored = await getStoredJob(jobId);
  if (!stored) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (user.role !== "admin" && stored.userId !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (stored.status === "succeeded" || stored.status === "failed") {
    return NextResponse.json(stored);
  }

  try {
    const remote = await fetchOpusJob(jobId);
    if (remote.status !== stored.status) {
      await updateJob(jobId, {
        status: remote.status,
        finishedAt: remote.status === "succeeded" || remote.status === "failed"
          ? Date.now()
          : undefined,
        error: remote.error,
      });
    }
    return NextResponse.json({ ...stored, status: remote.status, remoteClips: remote.clips.length });
  } catch (err) {
    return NextResponse.json(
      { ...stored, fetchError: (err as Error).message },
      { status: 200 },
    );
  }
}
