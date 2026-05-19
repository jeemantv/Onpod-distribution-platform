import { NextResponse } from "next/server";
import { getClipProject } from "@/lib/opusclip";
import { getJob, updateJob } from "@/lib/opus-job-store";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { b2, bucket, guessMimeType } from "@/lib/b2";

// OpusClip POSTs a webhook when a clip-project finishes (if WEBHOOK was
// included in conclusionActions). Shape isn't documented in what you sent
// me — we treat the webhook as a "go fetch the project state and import
// clips" trigger rather than trusting fields in the body.

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const projectId =
    (body.projectId as string | undefined) ??
    (body.id as string | undefined) ??
    (body.clipProjectId as string | undefined);

  if (!projectId) {
    console.warn("[opus webhook] missing projectId", body);
    return NextResponse.json({ received: true, known: false });
  }

  const stored = await getJob(projectId);
  if (!stored) {
    console.warn("[opus webhook] unknown job", projectId);
    return NextResponse.json({ received: true, known: false });
  }

  try {
    const remote = await getClipProject(projectId);
    if (remote.status !== "ready" || remote.clips.length === 0) {
      await updateJob(projectId, { status: remote.status === "failed" ? "failed" : "processing" });
      return NextResponse.json({ received: true, ready: false });
    }

    const projectPrefix = stored.videoKey.replace(/\/[^/]+$/, "");
    let delivered = 0;
    for (const [i, clip] of remote.clips.entries()) {
      try {
        const r = await fetch(clip.uriForExport);
        if (!r.ok) continue;
        const safeTitle = (clip.title || `clip_${i + 1}`)
          .replace(/[^\w-]+/g, "_")
          .slice(0, 60);
        const ext =
          clip.uriForExport.split(".").pop()?.split("?")[0]?.toLowerCase() ??
          "mp4";
        const name = `clip_${stored.stylePreset}_${i + 1}_${safeTitle}.${ext}`;
        const key = `${projectPrefix}/clips/${name}`;
        const buffer = new Uint8Array(await r.arrayBuffer());
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
        console.error("[opus webhook] clip save failed", err);
      }
    }

    await updateJob(projectId, {
      status: "succeeded",
      clipsDelivered: delivered,
      finishedAt: Date.now(),
    });
    return NextResponse.json({ received: true, delivered });
  } catch (err) {
    return NextResponse.json(
      { received: true, error: (err as Error).message },
      { status: 500 },
    );
  }
}
