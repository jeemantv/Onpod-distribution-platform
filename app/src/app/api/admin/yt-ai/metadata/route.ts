import { NextResponse } from "next/server";
import { generateAIPackage } from "@/lib/claude";
import { saveAI } from "@/lib/yt-ai-store";
import { errorJson, isResponse, loadOwnedJob, requireAdminApi } from "../_shared";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Title, description, tags, hashtags, chapters, summary — same Claude package
// the session AI tools produce, just fed from the YouTube transcript.
export async function POST(req: Request) {
  const user = requireAdminApi();
  if (isResponse(user)) return user;

  const { jobId } = (await req.json()) as { jobId?: string };
  const job = await loadOwnedJob(jobId ?? "", user.id);
  if (isResponse(job)) return job;

  const transcript = (job.transcript ?? "").trim();
  if (!transcript) {
    return NextResponse.json(
      { error: "no_transcript", message: "Transcribe the video first." },
      { status: 409 },
    );
  }

  try {
    // The transcript lines already carry [HH:MM:SS] stamps, so Claude has real
    // anchors for chapters instead of having to guess.
    const ai = await generateAIPackage(transcript, chapterAnchors(transcript));
    const updated = await saveAI(job.id, ai);
    return NextResponse.json({ ai: updated?.ai ?? ai });
  } catch (err) {
    return errorJson(err);
  }
}

// Every ~5th timestamped line, capped — enough anchors to keep chapter times
// honest without pushing the prompt over budget.
function chapterAnchors(transcript: string): string {
  const stamps = transcript
    .split("\n")
    .map((l) => l.match(/^\[(\d{2}:\d{2}:\d{2})\]/)?.[1])
    .filter((s): s is string => !!s);
  return stamps
    .filter((_, i) => i % 5 === 0)
    .slice(0, 120)
    .join("\n");
}
