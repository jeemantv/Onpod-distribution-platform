import { NextResponse } from "next/server";
import { decodeFileId, publicUrl } from "@/lib/b2";
import { createClipProject } from "@/lib/opusclip";
import { recordJob } from "@/lib/opus-job-store";
import { getSession } from "@/lib/session";
import { gate } from "@/lib/plan-gate-route";
import { canAccessKey } from "@/lib/access";

interface RequestBody {
  fileId: string;
  brandTemplateId?: string;
  count?: number | "auto";
  durationRange?: string;
}

function parseDurationRange(r: string | undefined): [number, number] {
  if (!r) return [0, 89];
  const [a, b] = r.split("-").map((n) => parseInt(n, 10));
  return [Number.isFinite(a) ? a : 0, Number.isFinite(b) ? b : 89];
}

export async function POST(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const gated = await gate(user, "clips");
  if (gated) return gated;

  const body = (await req.json()) as RequestBody;
  if (!body.fileId)
    return NextResponse.json({ error: "missing_fileId" }, { status: 400 });

  let key: string;
  try {
    key = decodeFileId(body.fileId);
  } catch {
    return NextResponse.json({ error: "invalid_file_id" }, { status: 400 });
  }
  if (!canAccessKey(user, key)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const [, projectId] = key.split("/");

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

    try {
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
    } catch (dbErr) {
      // Surface the real reason — when the user_id FK is stale (e.g.
      // browser cookie from a previous seed), the failed-query line is
      // not enough on its own to diagnose.
      const err = dbErr as Error & { code?: string; cause?: { code?: string } };
      const code = err.code ?? err.cause?.code;
      console.error("[opus/start] recordJob failed", {
        message: err.message,
        code,
        userId: user.id,
        jobId: opusProjectId,
      });
      if (code === "23503") {
        return NextResponse.json(
          {
            error: "stale_session",
            message: "Your session is out of date. Please sign out and sign back in.",
          },
          { status: 409 },
        );
      }
      throw dbErr;
    }

    return NextResponse.json({ jobId: opusProjectId, status: "queued" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[opus/start] failed", message);
    return NextResponse.json(
      { error: "opus_error", message },
      { status: 500 },
    );
  }
}
