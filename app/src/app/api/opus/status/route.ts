import { NextResponse } from "next/server";
import { getJob as getStoredJob, updateJob } from "@/lib/opus-job-store";
import { getClipProject, type OpusClipResult } from "@/lib/opusclip";
import { getSession } from "@/lib/session";
import { canAccessKey } from "@/lib/access";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { b2, bucket, guessMimeType } from "@/lib/b2";

export async function GET(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const jobId = new URL(req.url).searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ error: "missing_jobId" }, { status: 400 });

  const stored = await getStoredJob(jobId);
  if (!stored) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (
    user.role !== "admin" &&
    user.role !== "editor" &&
    stored.userId !== user.id &&
    !canAccessKey(user, stored.videoKey)
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (stored.status === "succeeded" || stored.status === "failed") {
    return NextResponse.json({ ...stored, clipsReady: stored.clipsDelivered });
  }

  try {
    const remote = await getClipProject(jobId);
    if (remote.status === "ready" && remote.clips.length > 0) {
      const delivered = await importClipsToB2(
        stored.videoKey,
        stored.stylePreset,
        remote.clips,
      );
      await updateJob(jobId, {
        status: "succeeded",
        clipsDelivered: delivered,
        finishedAt: Date.now(),
      });
      return NextResponse.json({
        ...stored,
        status: "succeeded",
        clipsDelivered: delivered,
        clipsRemote: remote.clips.length,
      });
    }
    if (remote.status === "failed") {
      await updateJob(jobId, { status: "failed", finishedAt: Date.now() });
      return NextResponse.json({ ...stored, status: "failed" });
    }
    await updateJob(jobId, { status: "processing" });
    return NextResponse.json({ ...stored, status: "processing" });
  } catch (err) {
    return NextResponse.json(
      { ...stored, fetchError: (err as Error).message },
      { status: 200 },
    );
  }
}

async function importClipsToB2(
  videoKey: string,
  stylePreset: string,
  clips: OpusClipResult[],
): Promise<number> {
  const projectPrefix = videoKey.replace(/\/[^/]+$/, "");
  let delivered = 0;
  for (const [i, clip] of clips.entries()) {
    try {
      const res = await fetch(clip.uriForExport);
      if (!res.ok) {
        console.error("[opus import] fetch clip", clip.uriForExport, res.status);
        continue;
      }
      const ct = res.headers.get("content-type") ?? "video/mp4";
      const ext =
        clip.uriForExport.split(".").pop()?.split("?")[0]?.toLowerCase() ??
        "mp4";
      const safeTitle = (clip.title || `clip_${i + 1}`)
        .replace(/[^\w-]+/g, "_")
        .slice(0, 60);
      const name = `clip_${stylePreset}_${i + 1}_${safeTitle}.${ext}`;
      const key = `${projectPrefix}/clips/${name}`;
      const buffer = new Uint8Array(await res.arrayBuffer());
      await b2.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: ct.startsWith("video/") ? ct : guessMimeType(name),
        }),
      );
      delivered += 1;
    } catch (err) {
      console.error("[opus import] failed", err);
    }
  }
  return delivered;
}
