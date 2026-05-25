// Vizard webhook receiver — fired when a clipping job finishes. The body
// shape isn't documented in detail, so we treat the webhook as a "go
// fetch project state and import clips" trigger rather than trusting
// fields in the body.

import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { b2, bucket, guessMimeType } from "@/lib/b2";
import { queryClipProject } from "@/lib/vizard";
import { getVizardJob, updateVizardJob } from "@/lib/vizard-job-store";

// Vercel Pro / Fluid Compute lets us go up to 800s. We need the
// headroom because some Vizard jobs return 30–50 clips and each
// download → B2 upload takes a few seconds.
export const maxDuration = 300;
const PARALLEL = 5;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const projectId =
    (body.projectId as string | number | undefined) ??
    (body.id as string | number | undefined);
  if (!projectId) {
    console.warn("[vizard webhook] missing projectId", body);
    return NextResponse.json({ received: true, known: false });
  }

  const stored = await getVizardJob(String(projectId));
  if (!stored) {
    console.warn("[vizard webhook] unknown job", projectId);
    return NextResponse.json({ received: true, known: false });
  }

  try {
    const remote = await queryClipProject(projectId);
    if (remote.code !== 2000 || !remote.videos || remote.videos.length === 0) {
      // 1000 = still processing; anything else with no videos = failed
      await updateVizardJob(String(projectId), {
        status: remote.code === 1000 ? "processing" : "failed",
        error: remote.message ?? `code ${remote.code}`,
      });
      return NextResponse.json({ received: true, ready: false, code: remote.code });
    }

    const projectPrefix = stored.videoKey.replace(/\/[^/]+$/, "");
    let delivered = 0;

    // Process N clips in parallel — total bandwidth pinned to ~PARALLEL
    // concurrent CDN downloads + B2 PUTs. Keeps memory bounded too.
    const saveOne = async (i: number, clip: { title?: string; videoUrl: string }) => {
      try {
        const r = await fetch(clip.videoUrl);
        if (!r.ok) return;
        const safeTitle = (clip.title || `clip_${i + 1}`)
          .replace(/[^\w-]+/g, "_")
          .slice(0, 60);
        const urlExt = clip.videoUrl.split(".").pop()?.split("?")[0]?.toLowerCase();
        const ext = urlExt && /^(mp4|mov|webm)$/i.test(urlExt) ? urlExt : "mp4";
        const name = `clip_vizard_${i + 1}_${safeTitle}.${ext}`;
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
        console.error("[vizard webhook] clip save failed", err);
      }
    };

    const queue = remote.videos.map((c, i) => ({ i, c }));
    const workers = Array.from({ length: PARALLEL }, async () => {
      while (queue.length) {
        const next = queue.shift();
        if (!next) return;
        await saveOne(next.i, next.c);
      }
    });
    await Promise.all(workers);

    await updateVizardJob(String(projectId), {
      status: "succeeded",
      clipsDelivered: delivered,
      finishedAt: Date.now(),
    });
    return NextResponse.json({ received: true, delivered });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[vizard webhook] failed", message);
    await updateVizardJob(String(projectId), {
      status: "failed",
      error: message,
    });
    return NextResponse.json({ received: true, error: message }, { status: 500 });
  }
}
