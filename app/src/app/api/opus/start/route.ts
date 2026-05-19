import { NextResponse } from "next/server";
import { decodeFileId, publicUrl } from "@/lib/b2";
import { createClipProject } from "@/lib/opusclip";
import { recordJob } from "@/lib/opus-job-store";
import { getSession } from "@/lib/session";

interface RequestBody {
  fileId: string;
  brandTemplateId?: string;
  count?: number | "auto";
  durationRange: "0-29" | "30-59" | "60-89";
}

function parseDurationRange(r: RequestBody["durationRange"]): [number, number] {
  const [a, b] = r.split("-").map((n) => parseInt(n, 10));
  return [a || 0, b || 89];
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
    body.brandTemplateId ||
    process.env.OPUSCLIP_BRAND_TEMPLATE_ID ||
    undefined;

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
      stylePreset: brandTemplateId ?? "default",
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
