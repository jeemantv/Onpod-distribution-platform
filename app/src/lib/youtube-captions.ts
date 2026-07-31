// Pull a transcript straight off YouTube using the owner's OAuth token.
//
// This is the path for UNLISTED and PRIVATE videos. Gemini can only watch
// public videos (it fetches them as an anonymous viewer), but the Data API
// will hand the caption track to whoever owns the video — so if the link
// belongs to a channel connected in OnPod, we read the captions instead of
// paying Gemini to watch an hour of footage. Faster, cheaper, and exact.
//
// captions.download requires the youtube.force-ssl scope; connections made
// before that scope was added come back as "reconnect".

import { getAllChannelTokens } from "./youtube-store";
import { hasCaptionsScope } from "./youtube";

const API = "https://www.googleapis.com/youtube/v3";

export interface CaptionVideoInfo {
  title: string;
  channelTitle: string;
  privacyStatus: string;
  thumbnailUrl: string | null;
}

export type CaptionFailure =
  | "not_connected" // no YouTube channel connected at all
  | "reconnect" // connected, but the grant predates the captions scope
  | "not_owner" // none of the connected channels owns this video
  | "no_tracks" // owned, but the video has no caption track yet
  | "download_refused"; // YouTube refused to hand over the track

export interface CaptionSuccess {
  ok: true;
  transcript: string;
  info: CaptionVideoInfo | null;
  channelTitle: string;
  trackKind: string;
  language: string;
}

export interface CaptionFailed {
  ok: false;
  reason: CaptionFailure;
  message: string;
}

interface CaptionTrack {
  id: string;
  trackKind: string;
  language: string;
  name: string;
  isDraft: boolean;
  lastUpdated: string;
}

async function getVideoInfo(
  videoId: string,
  accessToken: string,
): Promise<CaptionVideoInfo | null> {
  const params = new URLSearchParams({ part: "snippet,status", id: videoId });
  const res = await fetch(`${API}/videos?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    items?: Array<{
      snippet?: {
        title?: string;
        channelTitle?: string;
        thumbnails?: Record<string, { url?: string }>;
      };
      status?: { privacyStatus?: string };
    }>;
  };
  const item = data.items?.[0];
  if (!item) return null;
  const thumbs = item.snippet?.thumbnails ?? {};
  const best =
    thumbs.maxres?.url ?? thumbs.standard?.url ?? thumbs.high?.url ?? thumbs.medium?.url ?? null;
  return {
    title: item.snippet?.title ?? "",
    channelTitle: item.snippet?.channelTitle ?? "",
    privacyStatus: item.status?.privacyStatus ?? "",
    thumbnailUrl: best,
  };
}

async function listTracks(
  videoId: string,
  accessToken: string,
): Promise<{ tracks: CaptionTrack[]; forbidden: boolean }> {
  const params = new URLSearchParams({ part: "snippet", videoId });
  const res = await fetch(`${API}/captions?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  // 403 here means this channel doesn't own the video — try the next one.
  if (res.status === 403 || res.status === 404) return { tracks: [], forbidden: true };
  if (!res.ok) return { tracks: [], forbidden: false };
  const data = (await res.json()) as {
    items?: Array<{
      id: string;
      snippet?: {
        trackKind?: string;
        language?: string;
        name?: string;
        isDraft?: boolean;
        lastUpdated?: string;
      };
    }>;
  };
  const tracks = (data.items ?? []).map((it) => ({
    id: it.id,
    trackKind: it.snippet?.trackKind ?? "standard",
    language: it.snippet?.language ?? "",
    name: it.snippet?.name ?? "",
    isDraft: !!it.snippet?.isDraft,
    lastUpdated: it.snippet?.lastUpdated ?? "",
  }));
  return { tracks, forbidden: false };
}

async function downloadTrack(
  trackId: string,
  accessToken: string,
): Promise<{ srt: string | null; status: number; body: string }> {
  const res = await fetch(`${API}/captions/${trackId}?tfmt=srt`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    return { srt: null, status: res.status, body: (await res.text()).slice(0, 300) };
  }
  return { srt: await res.text(), status: 200, body: "" };
}

/** A human-uploaded track beats YouTube's ASR; drafts come last. */
function rankTracks(tracks: CaptionTrack[]): CaptionTrack[] {
  return [...tracks].sort((a, b) => {
    const score = (t: CaptionTrack) =>
      (t.trackKind === "ASR" ? 1 : 0) + (t.isDraft ? 2 : 0) + (t.trackKind === "forced" ? 4 : 0);
    return score(a) - score(b);
  });
}

/**
 * SRT → the same "[HH:MM:SS] text" shape the Gemini path produces, so the
 * downstream Claude prompts don't care which source the transcript came from.
 * Cues are merged into ~30s lines to keep it readable.
 */
export function srtToTranscript(srt: string, mergeSeconds = 30): string {
  const blocks = srt.replace(/\r/g, "").split(/\n\n+/);
  const cues: Array<{ start: number; text: string }> = [];

  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    if (lines.length < 2) continue;
    const timeLine = lines.find((l) => l.includes("-->"));
    if (!timeLine) continue;
    const start = parseSrtTime(timeLine.split("-->")[0].trim());
    if (start === null) continue;
    const text = lines
      .filter((l) => l !== timeLine && !/^\d+$/.test(l.trim()))
      .join(" ")
      // Auto-captions carry position/karaoke tags.
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (text) cues.push({ start, text });
  }

  const out: string[] = [];
  let bucketStart: number | null = null;
  let bucket: string[] = [];
  const flush = () => {
    if (bucketStart !== null && bucket.length) {
      out.push(`[${fmtClock(bucketStart)}] ${dedupeOverlap(bucket).trim()}`);
    }
    bucket = [];
  };
  for (const cue of cues) {
    if (bucketStart === null || cue.start - bucketStart >= mergeSeconds) {
      flush();
      bucketStart = cue.start;
    }
    bucket.push(cue.text);
  }
  flush();
  return out.join("\n");
}

// YouTube's ASR cues repeat the tail of the previous cue as the head of the
// next one (rolling captions). Drop the repeated words when joining.
function dedupeOverlap(parts: string[]): string {
  let joined = parts[0] ?? "";
  for (let i = 1; i < parts.length; i++) {
    const next = parts[i];
    const prevWords = joined.split(" ");
    const nextWords = next.split(" ");
    let overlap = 0;
    const max = Math.min(prevWords.length, nextWords.length, 12);
    for (let n = max; n > 0; n--) {
      if (prevWords.slice(-n).join(" ").toLowerCase() === nextWords.slice(0, n).join(" ").toLowerCase()) {
        overlap = n;
        break;
      }
    }
    joined = `${joined} ${nextWords.slice(overlap).join(" ")}`.trim();
  }
  return joined;
}

function parseSrtTime(s: string): number | null {
  const m = s.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{1,3})/);
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/**
 * Try every channel this user has connected until one of them owns the video,
 * then pull its best caption track.
 */
export async function importCaptions(
  userId: string,
  videoId: string,
): Promise<CaptionSuccess | CaptionFailed> {
  const tokens = await getAllChannelTokens(userId);
  if (tokens.length === 0) {
    return {
      ok: false,
      reason: "not_connected",
      message:
        "No YouTube channel is connected, so unlisted and private videos can't be read. Connect the channel that owns this video, or use a public link.",
    };
  }
  if (!tokens.some((t) => hasCaptionsScope(t.scope))) {
    return {
      ok: false,
      reason: "reconnect",
      message:
        "Your YouTube connection predates the caption permission. Reconnect the channel to let OnPod read transcripts of unlisted and private videos.",
    };
  }

  let sawTracks = false;
  let refusal = "";
  for (const t of tokens) {
    if (!hasCaptionsScope(t.scope)) continue;
    const { tracks } = await listTracks(videoId, t.accessToken);
    if (tracks.length === 0) continue;
    sawTracks = true;

    for (const track of rankTracks(tracks)) {
      const { srt, status, body } = await downloadTrack(track.id, t.accessToken);
      if (!srt) {
        refusal = `${status} ${body}`;
        continue;
      }
      const transcript = srtToTranscript(srt);
      if (!transcript.trim()) {
        refusal = "the caption track came back empty";
        continue;
      }
      const info = await getVideoInfo(videoId, t.accessToken);
      return {
        ok: true,
        transcript,
        info,
        channelTitle: t.title,
        trackKind: track.trackKind,
        language: track.language,
      };
    }
  }

  if (sawTracks) {
    return {
      ok: false,
      reason: "download_refused",
      message: `YouTube would not hand over the caption track (${refusal || "no reason given"}). Auto-generated captions are sometimes locked; the reliable fix is to download the .srt from YouTube Studio and re-upload it as a regular caption track.`,
    };
  }
  return {
    ok: false,
    reason: "not_owner",
    message:
      "None of your connected channels owns this video, or it has no caption track yet. YouTube usually finishes auto-captioning within an hour of upload.",
  };
}
