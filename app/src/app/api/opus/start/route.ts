import { NextResponse } from "next/server";
import { decodeFileId, publicUrl } from "@/lib/b2";
import { createClipProject } from "@/lib/opusclip";
import { recordJob } from "@/lib/opus-job-store";
import { getSession } from "@/lib/session";

interface RequestBody {
  fileId: string;
  styleTemplateId: "onpod-bold" | "minimal" | "viral";
  aspectRatio: "9:16" | "1:1" | "16:9";
  count: number | "auto";
  durationRange: "15-30" | "30-60" | "60-90";
  branding: "onpod-default" | "none" | "custom";
}

function parseDurationRange(r: RequestBody["durationRange"]): [number, number] {
  const [a, b] = r.split("-").map((n) => parseInt(n, 10));
  return [a || 0, b || 90];
}

export async function POST(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as RequestBody;
  if (!body.fileId)
    return NextResponse.json({ error: "missing_fileId" }, { status: 400 });

  let key: string;
  try {
    key = decodeFileId(body.fileId);
  } catch {
    return NextResponse.json({ error: "invalid_file_id" }, { status: 400 });
  }
  const [ownerId, projectId] = key.split("/");
  if (user.role !== "admin" && ownerId !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const sourceUrl = publicUrl(key);
  const origin = new URL(req.url).origin;
  const webhookUrl = `${origin}/api/opus/webhook`;
  const notifyEmail = process.env.OPUSCLIP_NOTIFY_EMAIL ?? user.email;
  const brandTemplateId =
    body.branding === "none"
      ? undefined
      : process.env.OPUSCLIP_BRAND_TEMPLATE_ID;

  try {
    const { projectId: opusProjectId } = await createClipProject({
      videoUrl: sourceUrl,
      notifyEmail,
      clipDurationSeconds: parseDurationRange(body.durationRange),
      topicKeywords: [""],
      genre: "Auto",
      brandTemplateId,
      webhookUrl,
      sourceLang: "auto",
    });

    await recordJob({
      jobId: opusProjectId,
      userId: user.id,
      videoKey: key,
      projectId,
      stylePreset: body.styleTemplateId,
      startedAt: Date.now(),
      status: "queued",
      clipsDelivered: 0,
    });

    return NextResponse.json({ jobId: opusProjectId, status: "queued" });
  } catch (err) {
    return NextResponse.json(
      { error: "opus_error", message: (err as Error).message },
      { status: 500 },
    );
  }
}
