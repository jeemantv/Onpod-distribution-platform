// OpusClip Partner API client.
//
// Endpoint:  POST https://api.opus.pro/api/clip-projects
// Auth:      Authorization: Bearer <OPUSCLIP_API_KEY>
// Spec §9.

const BASE = process.env.OPUSCLIP_BASE_URL ?? "https://api.opus.pro/api";

function authHeaders(): HeadersInit {
  const key = process.env.OPUSCLIP_API_KEY;
  if (!key) throw new Error("OPUSCLIP_API_KEY not set");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

export interface OpusClipResult {
  id: string;
  projectId: string;
  curationId: string;
  uriForPreview: string;
  uriForExport: string;
  durationMs: number;
  timeRanges: number[][];
  keywords?: string[];
  promptName?: string;
  title: string;
  description?: string;
}

export interface CreateClipsRequest {
  videoUrl: string;
  notifyEmail: string;
  clipDurationSeconds: [number, number]; // e.g. [0, 90]
  topicKeywords?: string[];
  genre?: string; // "Auto" | "Education" | ... — passthrough to OpusClip
  brandTemplateId?: string;
  webhookUrl?: string;
  sourceLang?: string; // "auto" or ISO code
}

export async function createClipProject(
  req: CreateClipsRequest,
): Promise<{ projectId: string; raw: unknown }> {
  const conclusionActions: Array<Record<string, unknown>> = [
    { type: "EMAIL", notifyFailure: true, email: req.notifyEmail },
  ];
  if (req.webhookUrl) {
    conclusionActions.push({
      type: "WEBHOOK",
      url: req.webhookUrl,
      notifyFailure: true,
    });
  }

  const body = {
    videoUrl: req.videoUrl,
    conclusionActions,
    curationPref: {
      clipDurations: [req.clipDurationSeconds],
      topicKeywords: req.topicKeywords ?? [""],
      genre: req.genre ?? "Auto",
      skipCurate: false,
    },
    importPref: { sourceLang: req.sourceLang ?? "auto" },
    ...(req.brandTemplateId ? { brandTemplateId: req.brandTemplateId } : {}),
  };

  const res = await fetch(`${BASE}/clip-projects`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpusClip ${res.status}: ${text.slice(0, 500)}`);
  }
  const data = (await res.json()) as Record<string, unknown>;

  // OpusClip returns the created project. The id field varies by version —
  // try a few shapes.
  const projectId =
    (data.projectId as string | undefined) ??
    (data.id as string | undefined) ??
    ((data.project as { id?: string } | undefined)?.id);

  if (!projectId) {
    throw new Error(
      `OpusClip response missing projectId; got keys: ${Object.keys(data).join(",")}`,
    );
  }

  return { projectId, raw: data };
}

export async function getClipProject(
  projectId: string,
): Promise<{ status: "processing" | "ready" | "failed"; clips: OpusClipResult[]; raw: unknown }> {
  const res = await fetch(`${BASE}/clip-projects/${projectId}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(`OpusClip GET ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as unknown;

  // The GET response can be either:
  //   - an array of clip objects (when clips are ready)
  //   - an object with project metadata + a clips/curations array
  // Handle both.
  let clips: OpusClipResult[] = [];
  let status: "processing" | "ready" | "failed" = "processing";

  if (Array.isArray(data)) {
    clips = data.map(normalizeClip);
    status = clips.length > 0 ? "ready" : "processing";
  } else if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const clipsArr =
      (obj.clips as unknown[] | undefined) ??
      (obj.curations as unknown[] | undefined) ??
      (obj.results as unknown[] | undefined) ??
      [];
    clips = clipsArr.map((c) => normalizeClip(c as Record<string, unknown>));
    const remoteStatus = (obj.status as string | undefined) ?? "";
    if (remoteStatus.toLowerCase().includes("fail")) status = "failed";
    else if (clips.length > 0) status = "ready";
    else status = "processing";
  }

  return { status, clips, raw: data };
}

function normalizeClip(c: Record<string, unknown>): OpusClipResult {
  return {
    id: String(c.id ?? c.curationId ?? `${c.projectId}-${Math.random().toString(36).slice(2, 6)}`),
    projectId: String(c.projectId ?? ""),
    curationId: String(c.curationId ?? c.id ?? ""),
    uriForPreview: String(c.uriForPreview ?? c.previewUrl ?? ""),
    uriForExport: String(c.uriForExport ?? c.exportUrl ?? c.url ?? c.uriForPreview ?? ""),
    durationMs: Number(c.durationMs ?? c.duration ?? 0),
    timeRanges: (c.timeRanges as number[][] | undefined) ?? [],
    keywords: c.keywords as string[] | undefined,
    promptName: c.promptName as string | undefined,
    title: String(c.title ?? "Untitled clip"),
    description: c.description as string | undefined,
  };
}
