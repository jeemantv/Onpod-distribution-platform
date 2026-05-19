// OpusClip Partner API client. Spec §9.
//
// IMPORTANT: OpusClip's developer API surface is gated/partner-only. The
// endpoints, request shapes, and auth header below match the documented
// pattern in their developer portal but you should VERIFY against current
// docs before relying on this in production:
//   https://help.opus.pro/api  (or whatever your partner contact gives you)
//
// If endpoints differ, change OPUSCLIP_BASE_URL in .env.local and edit the
// paths in this file — the rest of the app talks to this module via the
// exported functions and doesn't care about the wire shape.

const BASE = process.env.OPUSCLIP_BASE_URL ?? "https://api.opus.pro/v1";

function authHeaders(): HeadersInit {
  const key = process.env.OPUSCLIP_API_KEY;
  if (!key) throw new Error("OPUSCLIP_API_KEY not set");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

export interface OpusJob {
  id: string;
  status: "queued" | "processing" | "succeeded" | "failed";
  clips: OpusClip[];
  error?: string;
}

export interface OpusClip {
  url: string;
  durationSeconds: number;
  title?: string;
  aspect?: string;
}

export interface CreateClipsRequest {
  sourceUrl: string;
  styleTemplateId: "onpod-bold" | "minimal" | "viral";
  aspectRatio: "9:16" | "1:1" | "16:9";
  count: number | "auto";
  durationRange: "15-30" | "30-60" | "60-90";
  branding: "onpod-default" | "none" | "custom";
  webhookUrl?: string;
  metadata?: Record<string, unknown>;
}

export async function createClips(
  req: CreateClipsRequest,
): Promise<{ jobId: string }> {
  const res = await fetch(`${BASE}/clips`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      source_url: req.sourceUrl,
      style_template_id: req.styleTemplateId,
      aspect_ratio: req.aspectRatio,
      count: req.count === "auto" ? undefined : req.count,
      clip_duration: req.durationRange,
      branding: req.branding,
      webhook_url: req.webhookUrl,
      metadata: req.metadata,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpusClip ${res.status}: ${text.slice(0, 500)}`);
  }
  const data = (await res.json()) as { id?: string; job_id?: string };
  const id = data.id ?? data.job_id;
  if (!id) throw new Error("OpusClip response missing job id");
  return { jobId: id };
}

export async function getJob(jobId: string): Promise<OpusJob> {
  const res = await fetch(`${BASE}/jobs/${jobId}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(`OpusClip job ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    id: string;
    status: string;
    clips?: Array<{ url: string; duration?: number; title?: string; aspect?: string }>;
    error?: string;
  };
  const status =
    data.status === "completed" || data.status === "success"
      ? "succeeded"
      : data.status === "queued" || data.status === "pending"
        ? "queued"
        : data.status === "failed" || data.status === "error"
          ? "failed"
          : "processing";
  return {
    id: data.id,
    status,
    clips: (data.clips ?? []).map((c) => ({
      url: c.url,
      durationSeconds: c.duration ?? 0,
      title: c.title,
      aspect: c.aspect,
    })),
    error: data.error,
  };
}
