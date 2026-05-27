// Buzzsprout REST API client. Buzzsprout is the upstream podcast host
// that fans episodes out to Spotify, Apple Podcasts, Amazon Music,
// Pocket Casts, etc. Each client supplies their own API token +
// podcast ID (their account, their hosting bill).
//
// Docs: https://github.com/Buzzsprout/buzzsprout-api
// Auth: header `Authorization: Token token=<api_token>`
// Base: https://www.buzzsprout.com/api/{podcast_id}

const BASE = "https://www.buzzsprout.com/api";

export interface BuzzsproutEpisode {
  id: number;
  title: string;
  audio_url: string | null;
  artwork_url: string | null;
  description: string | null;
  summary: string | null;
  artist: string | null;
  tags: string | null;
  published_at: string | null;
  duration: number | null;
  hq: boolean;
  magic_mastering: boolean;
  guid: string | null;
  inactive_at: string | null;
  custom_url: string | null;
  episode_number: number | null;
  season_number: number | null;
  explicit: boolean;
  private: boolean;
  total_plays: number;
}

export interface BuzzsproutPodcast {
  // Buzzsprout doesn't expose a single podcast-info endpoint — we use
  // listing episodes (limit 1) to validate the token + podcastId combo.
  podcastId: string;
  episodeCount: number;
}

interface CreateEpisodeInput {
  title: string;
  description?: string;
  summary?: string;
  artist?: string;
  tags?: string;
  audioUrl?: string;
  publishedAt?: string; // ISO; omit to publish immediately
  duration?: number; // seconds; Buzzsprout auto-detects if omitted
  artworkUrl?: string;
  explicit?: boolean;
  privateEp?: boolean;
  episodeNumber?: number;
  seasonNumber?: number;
}

function authHeader(token: string): Record<string, string> {
  return {
    Authorization: `Token token=${token}`,
    "User-Agent": "OnPod/1.0 (jeremy@onpod.io)",
  };
}

/**
 * Verify the token + podcastId combo by hitting the episodes listing.
 * A 401/403 means bad token; 404 means bad podcast id.
 */
export async function verifyConnection(
  podcastId: string,
  token: string,
): Promise<{ ok: true; podcast: BuzzsproutPodcast } | { ok: false; reason: string }> {
  const url = `${BASE}/${encodeURIComponent(podcastId)}/episodes.json`;
  let res: Response;
  try {
    res = await fetch(url, { headers: authHeader(token), cache: "no-store" });
  } catch (err) {
    return { ok: false, reason: `network: ${(err as Error).message}` };
  }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, reason: "Invalid API token" };
  }
  if (res.status === 404) {
    return { ok: false, reason: "Podcast ID not found for this token" };
  }
  if (!res.ok) {
    return { ok: false, reason: `Buzzsprout returned HTTP ${res.status}` };
  }
  const body = (await res.json().catch(() => [])) as BuzzsproutEpisode[];
  return {
    ok: true,
    podcast: { podcastId, episodeCount: Array.isArray(body) ? body.length : 0 },
  };
}

/**
 * Create an episode on Buzzsprout. Buzzsprout accepts audio_url pointing
 * to an MP3/MP4/M4A — it downloads + processes server-side and
 * distributes to all linked directories.
 */
export async function createEpisode(
  podcastId: string,
  token: string,
  input: CreateEpisodeInput,
): Promise<BuzzsproutEpisode> {
  const url = `${BASE}/${encodeURIComponent(podcastId)}/episodes.json`;
  const payload: Record<string, unknown> = {
    title: input.title,
    description: input.description ?? "",
    summary: input.summary ?? "",
    artist: input.artist ?? "",
    tags: input.tags ?? "",
    audio_url: input.audioUrl,
    published_at: input.publishedAt,
    duration: input.duration,
    artwork_url: input.artworkUrl,
    explicit: input.explicit ?? false,
    private: input.privateEp ?? false,
    episode_number: input.episodeNumber,
    season_number: input.seasonNumber,
  };
  // Strip undefined so Buzzsprout doesn't get JSON nulls where it
  // expects "field omitted" semantics.
  for (const k of Object.keys(payload)) {
    if (payload[k] === undefined) delete payload[k];
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { ...authHeader(token), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Buzzsprout create failed (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  return (await res.json()) as BuzzsproutEpisode;
}

/**
 * List episodes — used by /api/buzzsprout/status to render the
 * "recently published" preview in the modal.
 */
export async function listEpisodes(
  podcastId: string,
  token: string,
): Promise<BuzzsproutEpisode[]> {
  const url = `${BASE}/${encodeURIComponent(podcastId)}/episodes.json`;
  const res = await fetch(url, { headers: authHeader(token), cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as BuzzsproutEpisode[];
}
