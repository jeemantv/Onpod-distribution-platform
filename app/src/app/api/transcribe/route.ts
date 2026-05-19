import { NextResponse } from "next/server";
import { decodeFileId, getDownloadUrl } from "@/lib/b2";
import { transcribeFromUrl, formatChaptersFromParagraphs } from "@/lib/deepgram";
import { generateAIPackage } from "@/lib/claude";
import {
  hasAI,
  hasTranscript,
  getTranscript,
  saveAI,
  saveTranscript,
} from "@/lib/transcript-store";
import { getJob, setJob } from "@/lib/job-tracker";
import { getSession } from "@/lib/session";

// Spec §6.3 / §6.4. Background pipeline:
//   1. Deepgram Nova-2 → transcript + paragraphs (saved as {video}.transcript.json)
//   2. Claude Sonnet → AI content package        (saved as {video}.ai.json)
//
// TODO: This runs as a fire-and-forget Promise on the request handler. Works on
// `next dev` (single long-lived Node process) but breaks on serverless hosts
// that kill the handler when it returns. Swap for Inngest / Cloud Tasks /
// Deepgram callbacks + ngrok when deploying.

export async function POST(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { fileId } = (await req.json()) as { fileId: string };
  if (!fileId)
    return NextResponse.json({ error: "missing fileId" }, { status: 400 });

  let key: string;
  try {
    key = decodeFileId(fileId);
  } catch {
    return NextResponse.json({ error: "invalid_file_id" }, { status: 400 });
  }

  const [ownerId] = key.split("/", 1);
  if (user.role !== "admin" && ownerId !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (await hasAI(key)) {
    return NextResponse.json({ status: "ready", cached: true });
  }

  const existingJob = getJob(key);
  if (
    existingJob &&
    (existingJob.stage === "transcribing" || existingJob.stage === "generating")
  ) {
    return NextResponse.json({ status: existingJob.stage, cached: false });
  }

  setJob(key, { stage: "transcribing", progress: 5, error: undefined });
  void runPipeline(key);

  return NextResponse.json({ status: "transcribing", cached: false });
}

async function runPipeline(videoKey: string): Promise<void> {
  try {
    let transcript = await getTranscript(videoKey);
    if (!transcript) {
      const signedUrl = await getDownloadUrl(videoKey, 60 * 60);
      transcript = await transcribeFromUrl(signedUrl);
      await saveTranscript(videoKey, transcript);
    } else {
      console.log("[pipeline] cached transcript for", videoKey);
    }

    setJob(videoKey, { stage: "generating", progress: 80 });

    if (!(await hasAI(videoKey))) {
      const chaptersHint = formatChaptersFromParagraphs(transcript.paragraphs);
      const ai = await generateAIPackage(transcript.transcript, chaptersHint);
      await saveAI(videoKey, ai);
    }

    setJob(videoKey, {
      stage: "ready",
      progress: 100,
      finishedAt: Date.now(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[pipeline error]", videoKey, message);
    setJob(videoKey, {
      stage: "error",
      progress: 0,
      error: message,
      finishedAt: Date.now(),
    });
  }
}
