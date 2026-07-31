import { NextResponse } from "next/server";
import { generateArticle, type AIPackage, type ArticleFormat } from "@/lib/claude";
import { saveArticle } from "@/lib/yt-ai-store";
import { errorJson, isResponse, loadOwnedJob, requireAdminApi } from "../_shared";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const VALID: ReadonlyArray<ArticleFormat> = ["linkedin", "wordpress", "newsletter", "seoBlog"];

export async function POST(req: Request) {
  const user = requireAdminApi();
  if (isResponse(user)) return user;

  const { jobId, format } = (await req.json()) as { jobId?: string; format?: ArticleFormat };
  if (!format || !VALID.includes(format)) {
    return NextResponse.json({ error: "invalid_format" }, { status: 400 });
  }
  const job = await loadOwnedJob(jobId ?? "", user.id);
  if (isResponse(job)) return job;

  const transcript = (job.transcript ?? "").trim();
  if (!transcript || !job.ai) {
    return NextResponse.json(
      { error: "not_ready", message: "Generate the transcript and metadata first." },
      { status: 409 },
    );
  }

  try {
    const markdown = await generateArticle(format, transcript, job.ai as AIPackage);
    await saveArticle(job.id, format, markdown);
    return NextResponse.json({ format, markdown });
  } catch (err) {
    return errorJson(err);
  }
}
