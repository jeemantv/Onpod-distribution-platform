// Vizard.ai API client. Parallel to OpusClip — turns a long video into
// AI-clipped shorts. We use clipping mode (`getClips: 1`) only for v1.
//
// Set VIZARDAI_API_KEY in Vercel. Requires a paid Vizard plan.
//
// Reference: https://docs.vizard.ai/reference

const BASE = "https://elb-api.vizard.ai/hvizard-server-front/open-api/v1";

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const key = process.env.VIZARDAI_API_KEY;
  if (!key) throw new Error("VIZARDAI_API_KEY not configured");
  return {
    VIZARDAI_API_KEY: key,
    ...extra,
  };
}

export interface VizardCreateInput {
  videoUrl: string;
  // 1=direct file, 2=YouTube, 3=GDrive, 4=Vimeo. We use 1 for B2 mp4s.
  videoType: number;
  // Required when videoType is 1. mp4 / mov / avi / 3gp.
  ext?: string;
  lang?: string;
  // 0=auto, 1=<30s, 2=30-60s, 3=60-90s, 4=>90s
  preferLength?: number[];
  webhookUrl?: string;
  projectName?: string;
  // Brand template — Vizard's docs only document this for editing mode,
  // but per the operator it also styles clipping output. Sent through
  // when provided; if Vizard rejects we surface the error code.
  templateId?: string | number;
}

export interface VizardCreateResponse {
  code: number;
  projectId: number;
  message?: string;
}

export async function createClipProject(input: VizardCreateInput): Promise<{ projectId: number }> {
  const body: Record<string, unknown> = {
    videoUrl: input.videoUrl,
    videoType: input.videoType,
    ext: input.ext,
    lang: input.lang ?? "auto",
    preferLength: input.preferLength ?? [0],
    getClips: 1,
    webhookUrl: input.webhookUrl,
    projectName: input.projectName,
  };
  if (input.templateId !== undefined && input.templateId !== "") {
    // Vizard expects long here — but their docs are also inconsistent,
    // so we pass through whatever string/number the caller provided.
    const asNum = typeof input.templateId === "string" ? Number(input.templateId) : input.templateId;
    body.templateId = Number.isFinite(asNum) ? asNum : input.templateId;
  }
  const res = await fetch(`${BASE}/project/create`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`vizard create ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as VizardCreateResponse;
  if (data.code !== 2000) {
    throw new Error(`vizard create code ${data.code}: ${data.message ?? "no message"}`);
  }
  return { projectId: data.projectId };
}

export interface VizardClip {
  videoId: number;
  videoUrl: string;
  videoMsDuration: number;
  title: string;
  transcript?: string;
  viralScore?: string;
  viralReason?: string;
}

export interface VizardQueryResponse {
  code: number;
  projectId: number;
  projectName?: string;
  videos?: VizardClip[];
  message?: string;
}

export async function queryClipProject(projectId: number | string): Promise<VizardQueryResponse> {
  const res = await fetch(`${BASE}/project/query/${projectId}`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`vizard query ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as VizardQueryResponse;
}
