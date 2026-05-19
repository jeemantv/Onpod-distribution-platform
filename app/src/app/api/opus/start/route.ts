import { NextResponse } from "next/server";
import { decodeFileId, publicUrl } from "@/lib/b2";
import { createClips, type CreateClipsRequest } from "@/lib/opusclip";
import { recordJob } from "@/lib/opus-job-store";
import { getSession } from "@/lib/session";

interface RequestBody {
  fileId: string;
  styleTemplateId: CreateClipsRequest["styleTemplateId"];
  aspectRatio: CreateClipsRequest["aspectRatio"];
  count: CreateClipsRequest["count"];
  durationRange: CreateClipsRequest["durationRange"];
  branding: CreateClipsRequest["branding"];
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

  try {
    const { jobId } = await createClips({
      sourceUrl,
      styleTemplateId: body.styleTemplateId,
      aspectRatio: body.aspectRatio,
      count: body.count,
      durationRange: body.durationRange,
      branding: body.branding,
      webhookUrl,
      metadata: { videoKey: key, userId: user.id, projectId },
    });

    await recordJob({
      jobId,
      userId: user.id,
      videoKey: key,
      projectId,
      stylePreset: body.styleTemplateId,
      startedAt: Date.now(),
      status: "queued",
      clipsDelivered: 0,
    });

    return NextResponse.json({ jobId, status: "queued" });
  } catch (err) {
    return NextResponse.json(
      { error: "opus_error", message: (err as Error).message },
      { status: 500 },
    );
  }
}
