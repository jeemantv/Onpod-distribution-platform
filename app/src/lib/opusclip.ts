// OpusClip Partner API client.
//
// Endpoints:
//   POST /api/clip-projects                       — create a clip-project
//   GET  /api/clip-projects/{id}                  — project metadata
//   GET  /api/exportable-clips?projectId={id}     — clip list ({ data, total })
//   GET  /api/brand-templates                     — list brand templates
//
// Auth: Authorization: Bearer <OPUSCLIP_API_KEY>

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
  runId: string;
  uriForPreview: string;
  uriForExport: string;
  uriForThumbnail: string;
  durationMs: number;
  title: string;
  description?: string;
  timeRanges?: number[][];
  keywords?: string[];
}

export interface CreateClipsRequest {
  videoUrl: string;
  notifyEmail: string;
  clipDurationSeconds: [number, number];
  topicKeywords?: string[];
  genre?: string;
  brandTemplateId?: string;
  webhookUrl?: string;
  sourceLang?: string;
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
    throw new Error(`OpusClip ${res.status}: ${(await res.text()).slice(0, 500)}`);
  }
  const data = (await res.json()) as Record<string, unknown>;
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

export async function getProjectStage(
  projectId: string,
): Promise<{ stage: string; error: string | null }> {
  const res = await fetch(`${BASE}/clip-projects/${projectId}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(`OpusClip ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const d = (await res.json()) as { stage?: string; error?: string | null };
  return { stage: d.stage ?? "UNKNOWN", error: d.error ?? null };
}

export async function listExportableClips(
  projectId: string,
): Promise<OpusClipResult[]> {
  const params = new URLSearchParams({ projectId, pageSize: "50" });
  const res = await fetch(
    `${BASE}/exportable-clips?${params.toString()}`,
    { headers: authHeaders() },
  );
  if (!res.ok) {
    throw new Error(
      `OpusClip exportable-clips ${res.status}: ${(await res.text()).slice(0, 300)}`,
    );
  }
  const body = (await res.json()) as { data?: unknown[]; total?: number };
  return (body.data ?? []).map((c) => {
    const r = c as Record<string, unknown>;
    return {
      id: String(r.id ?? ""),
      projectId: String(r.projectId ?? projectId),
      curationId: String(r.curationId ?? ""),
      runId: String(r.runId ?? ""),
      uriForPreview: String(r.uriForPreview ?? ""),
      uriForExport: String(r.uriForExport ?? r.uriForPreview ?? ""),
      uriForThumbnail: String(r.uriForThumbnail ?? ""),
      durationMs: Number(r.durationMs ?? r.duration ?? 0),
      title: String(r.title ?? "Untitled clip"),
      description: r.description as string | undefined,
      timeRanges: r.timeRanges as number[][] | undefined,
      keywords: r.keywords as string[] | undefined,
    };
  });
}

export async function getClipProject(
  projectId: string,
): Promise<{
  status: "processing" | "ready" | "failed";
  clips: OpusClipResult[];
  raw: unknown;
}> {
  const { stage, error } = await getProjectStage(projectId);
  const stageLower = stage.toLowerCase();
  if (stageLower === "failed" || stageLower === "error" || error) {
    return { status: "failed", clips: [], raw: { stage, error } };
  }
  if (stageLower !== "complete" && stageLower !== "completed" && stageLower !== "success") {
    return { status: "processing", clips: [], raw: { stage } };
  }
  const clips = await listExportableClips(projectId);
  return {
    status: clips.length > 0 ? "ready" : "processing",
    clips,
    raw: { stage, clipCount: clips.length },
  };
}

export interface BrandTemplate {
  id: string;
  name: string;
}

export async function listBrandTemplates(): Promise<BrandTemplate[]> {
  const res = await fetch(`${BASE}/brand-templates`, { headers: authHeaders() });
  if (!res.ok) return [];
  const body = (await res.json()) as { data?: unknown[]; list?: unknown[] };
  const items = body.data ?? body.list ?? [];
  return items.map((it) => {
    const r = it as Record<string, unknown>;
    return { id: String(r.id ?? ""), name: String(r.name ?? "Untitled") };
  });
}
