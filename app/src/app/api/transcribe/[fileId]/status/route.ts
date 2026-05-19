import { NextResponse } from "next/server";
import { decodeFileId } from "@/lib/b2";
import { getAI, getTranscript, hasAI, hasTranscript } from "@/lib/transcript-store";
import { deriveProgress, getJob } from "@/lib/job-tracker";
import { getSession } from "@/lib/session";

export async function GET(
  req: Request,
  { params }: { params: { fileId: string } },
) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let key: string;
  try {
    key = decodeFileId(params.fileId);
  } catch {
    return NextResponse.json({ error: "invalid_file_id" }, { status: 400 });
  }

  const [ownerId] = key.split("/", 1);
  if (user.role !== "admin" && ownerId !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const includeData = new URL(req.url).searchParams.get("include") === "data";

  const job = getJob(key);

  if (await hasAI(key)) {
    const body: Record<string, unknown> = {
      status: "ready",
      progress: 100,
      hasTranscript: true,
      hasAI: true,
    };
    if (includeData) {
      body.transcript = await getTranscript(key);
      body.ai = await getAI(key);
    }
    return NextResponse.json(body);
  }

  if (await hasTranscript(key)) {
    const body: Record<string, unknown> = {
      status: job?.stage ?? "generating",
      progress: job ? deriveProgress(job.stage, Date.now() - job.startedAt) : 80,
      hasTranscript: true,
      hasAI: false,
    };
    if (includeData) body.transcript = await getTranscript(key);
    return NextResponse.json(body);
  }

  if (job) {
    return NextResponse.json({
      status: job.stage,
      progress: deriveProgress(job.stage, Date.now() - job.startedAt),
      hasTranscript: false,
      hasAI: false,
      error: job.error,
    });
  }

  return NextResponse.json({
    status: "idle",
    progress: 0,
    hasTranscript: false,
    hasAI: false,
  });
}
