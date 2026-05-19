import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { b2, bucket, guessMimeType } from "@/lib/b2";
import { getJob, updateJob } from "@/lib/opus-job-store";

// OpusClip webhook payload: depends on their docs, this is a best-guess shape.
// Adjust the field names below if your OpusClip docs show different names.
interface OpusWebhookBody {
  job_id?: string;
  id?: string;
  status: string;
  clips?: Array<{
    url: string;
    duration?: number;
    title?: string;
    aspect?: string;
  }>;
  metadata?: { videoKey?: string; userId?: string; projectId?: string };
  error?: string;
}

export async function POST(req: Request) {
  const body = (await req.json()) as OpusWebhookBody;
  const jobId = body.job_id ?? body.id;
  if (!jobId) return NextResponse.json({ error: "missing_job_id" }, { status: 400 });

  const stored = await getJob(jobId);
  if (!stored) {
    console.warn("[opus webhook] unknown job", jobId);
    return NextResponse.json({ received: true, known: false });
  }

  if (body.status === "failed" || body.status === "error") {
    await updateJob(jobId, {
      status: "failed",
      error: body.error ?? "OpusClip job failed",
      finishedAt: Date.now(),
    });
    return NextResponse.json({ received: true });
  }

  if (body.status !== "completed" && body.status !== "success") {
    await updateJob(jobId, { status: "processing" });
    return NextResponse.json({ received: true });
  }

  // Download each clip and upload to B2 under {userId}/{projectId}/clips/
  const clips = body.clips ?? [];
  let delivered = 0;

  for (const [i, clip] of clips.entries()) {
    try {
      const res = await fetch(clip.url);
      if (!res.ok) {
        console.error("[opus] failed to fetch clip", clip.url, res.status);
        continue;
      }
      const buffer = new Uint8Array(await res.arrayBuffer());
      const ext = clip.url.split(".").pop()?.split("?")[0] ?? "mp4";
      const name = `clip_${stored.stylePreset}_${i + 1}.${ext}`;
      const key = `${stored.videoKey.replace(/\/[^/]+$/, "")}/clips/${name}`;
      await b2.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: guessMimeType(name),
        }),
      );
      delivered += 1;
    } catch (err) {
      console.error("[opus] clip save failed", err);
    }
  }

  await updateJob(jobId, {
    status: "succeeded",
    clipsDelivered: delivered,
    finishedAt: Date.now(),
  });

  return NextResponse.json({ received: true, delivered });
}
