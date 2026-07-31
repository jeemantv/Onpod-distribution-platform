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
    // No anchor list. Every transcript line already starts with an absolute
    // [HH:MM:SS] stamp, so Claude can pick the moments where the topic
    // actually turns. Handing it a sampled list of stamps instead made it walk
    // down that list in order and emit chapters on a mechanical fixed grid.
    const ai = await generateAIPackage(transcript);
    const updated = await saveAI(job.id, ai);
    return NextResponse.json({ ai: updated?.ai ?? ai });
  } catch (err) {
    return errorJson(err);
  }
}
