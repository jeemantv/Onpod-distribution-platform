// Submit a clipping job to Vizard. The video URL is the file's public B2
// URL — Vizard fetches it directly. Webhook + B2 import happens in
// /api/vizard/webhook on completion.

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { decodeFileId, publicUrl } from "@/lib/b2";
import { getSession } from "@/lib/session";
import { gate } from "@/lib/plan-gate-route";
import { canAccessKey } from "@/lib/access";
import { createClipProject } from "@/lib/vizard";
import { recordVizardJob } from "@/lib/vizard-job-store";
import { parseKey } from "@/lib/studio";
import { db } from "@/lib/db";
import { vizardTemplateOverrides } from "@/lib/db/schema";

interface RequestBody {
  fileId: string;
  lang?: string;
  templateId?: string;
  // 4-digit code if the template is locked. Required for clients on a
  // locked template; admin / editor bypass at the server below.
  lockCode?: string;
}

function extOf(name: string): string {
  const m = name.toLowerCase().match(/\.(mp4|mov|avi|3gp)$/);
  return m ? m[1] : "mp4";
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

  // Server-side template lock enforcement. The client-side /verify call
  // is just a UX preview — without this server check a client could
  // POST start with any templateId and skip the lock entirely.
  if (body.templateId && user.role !== "admin" && (user.role as string) !== "editor") {
    const [override] = await db
      .select({ lockCode: vizardTemplateOverrides.lockCode })
      .from(vizardTemplateOverrides)
      .where(eq(vizardTemplateOverrides.templateId, body.templateId))
      .limit(1);
    if (override?.lockCode) {
      const supplied = body.lockCode?.trim() ?? "";
      if (supplied !== override.lockCode) {
        return NextResponse.json(
          { error: "locked_template", message: "This template requires a 4-digit code." },
          { status: 403 },
        );
      }
    }
  }

  const videoUrl = publicUrl(key);
  const filename = key.split("/").slice(-1)[0] ?? "video.mp4";
  const parsed = parseKey(key);
  const sessionContext = parsed.sessionFolder ? `${parsed.studio}/${parsed.sessionFolder}` : null;
  // Webhook URL has to be a PUBLIC origin — Vercel's per-deployment URLs
  // (and previews) are gated by SSO so Vizard's server can't POST back.
  // Prefer the explicit canonical URL, then Vercel's production alias,
  // then fall back to the request origin (works in local dev).
  const canonical =
    process.env.NEXTAUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null);
  const origin = canonical ?? new URL(req.url).origin;
  const webhookUrl = `${origin}/api/vizard/webhook`;
  // Locked to under-90s output per product requirement: tell Vizard to
  // pick from any of the under-90 buckets (1=<30, 2=30-60, 3=60-90).
  const preferLength = [1, 2, 3];

  try {
    const { projectId } = await createClipProject({
      videoUrl,
      videoType: 1,
      ext: extOf(filename),
      lang: body.lang ?? "auto",
      preferLength,
      webhookUrl,
      projectName: filename,
      templateId: body.templateId,
    });

    try {
      await recordVizardJob({
        projectId: String(projectId),
        userId: user.id,
        videoKey: key,
        sessionContext,
        // 0 means "mixed under 90s" in our convention — Vizard got
        // [1,2,3] from us. The column is single-int for backwards-compat.
        preferLength: 0,
        status: "queued",
        clipsDelivered: 0,
        error: null,
        startedAt: Date.now(),
        finishedAt: null,
      });
    } catch (dbErr) {
      const err = dbErr as Error & { code?: string; cause?: { code?: string } };
      const code = err.code ?? err.cause?.code;
      console.error("[vizard/start] recordVizardJob failed", {
        message: err.message,
        code,
        userId: user.id,
        projectId,
      });
      if (code === "23503") {
        return NextResponse.json(
          { error: "stale_session", message: "Your session is out of date. Sign out and back in." },
          { status: 409 },
        );
      }
      throw dbErr;
    }

    return NextResponse.json({ projectId: String(projectId), status: "queued" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[vizard/start] failed", message);
    return NextResponse.json({ error: "vizard_error", message }, { status: 500 });
  }
}
