// AI YouTube — pull everything we need straight from a public YouTube link.
//
// There is no way to download a YouTube video from a serverless function
// (googlevideo URLs are IP-locked and signed), so instead of shipping audio to
// Deepgram we hand the URL to Gemini, which fetches and watches the video on
// Google's side. Transcription runs in windows (videoMetadata start/end
// offsets) so a two-hour episode never blows a single function's time budget:
// the client asks for one window at a time and we stitch them together.

const BASE = "https://generativelanguage.googleapis.com/v1beta";
const TRANSCRIBE_MODEL = "gemini-2.5-flash";
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);

// Minutes of video per transcription call. 20 min at low media resolution is
// roughly 80k input tokens — comfortably inside one function invocation.
export const SEGMENT_MINUTES = 20;
// Hard stop so a bad link can never loop forever (4 hours of video).
export const MAX_SEGMENTS = 12;

const NO_CONTENT = "NO_CONTENT";

export interface YouTubeMeta {
  videoId: string;
  url: string;
  title: string;
  channel: string;
  thumbnailUrl: string;
}

export interface SegmentResult {
  text: string; // timestamped transcript for this window ("" when past the end)
  ended: boolean; // true when the video ran out inside this window
}

/** Accepts watch/share/shorts/embed links and bare IDs. */
export function parseYouTubeId(input: string): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  if (/^[\w-]{11}$/.test(raw)) return raw;
  let u: URL;
  try {
    u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\./, "").toLowerCase();
  if (host === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0];
    return /^[\w-]{11}$/.test(id) ? id : null;
  }
  if (!/(^|\.)youtube(-nocookie)?\.com$/.test(host)) return null;
  const v = u.searchParams.get("v");
  if (v && /^[\w-]{11}$/.test(v)) return v;
  const m = u.pathname.match(/\/(shorts|embed|live|v)\/([\w-]{11})/);
  return m ? m[2] : null;
}

export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Title + channel via oEmbed (no API key, no quota). Falls back to a
 * placeholder title rather than failing the whole run — the AI package
 * writes its own title anyway.
 */
export async function fetchYouTubeMeta(videoId: string): Promise<YouTubeMeta> {
  const url = watchUrl(videoId);
  const base: YouTubeMeta = {
    videoId,
    url,
    title: "",
    channel: "",
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
  };
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      { cache: "no-store" },
    );
    if (!res.ok) return base;
    const data = (await res.json()) as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    };
    return {
      ...base,
      title: String(data.title ?? ""),
      channel: String(data.author_name ?? ""),
      thumbnailUrl: base.thumbnailUrl,
    };
  } catch {
    return base;
  }
}

/** Best available still for the video, as a base64 JPEG (for thumbnails). */
export async function fetchYouTubeStill(videoId: string): Promise<string> {
  const candidates = [
    `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/sddefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  ];
  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      // YouTube serves a 120x90 grey placeholder when a size is missing.
      if (buf.byteLength < 6000) continue;
      return buf.toString("base64");
    } catch {
      // try the next size
    }
  }
  throw new Error("Could not fetch a cover image for this video from YouTube.");
}

async function callGemini(model: string, apiKey: string, body: unknown): Promise<Response> {
  return fetch(`${BASE}/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function callWithRetry(
  model: string,
  apiKey: string,
  body: unknown,
  attempts = 3,
): Promise<string> {
  let lastStatus = 0;
  let lastBody = "";
  let res: Response | null = null;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1500));
    res = await callGemini(model, apiKey, body);
    if (res.ok) break;
    lastStatus = res.status;
    lastBody = await res.text();
    if (!RETRY_STATUSES.has(res.status)) break;
  }
  if (!res || !res.ok) {
    // 400 = Gemini reached YouTube and was turned away at the video.
    if (/is not available|PERMISSION_DENIED|not supported|unavailable/i.test(lastBody) && lastStatus === 400) {
      throw new Error(
        "Gemini could not open this video. It must be a PUBLIC YouTube video — unlisted, private, members-only and age-restricted videos are all rejected.",
      );
    }
    // 403 is ambiguous: either the video isn't public, or the API key itself
    // can't call this API. Say both, in the order worth checking.
    if (lastStatus === 403) {
      throw new Error(
        "Gemini refused the request (403 PERMISSION_DENIED). Two possible causes: " +
          "1) the video is not PUBLIC — unlisted, private and members-only videos cannot be read; " +
          "2) GEMINI_API_KEY is restricted or its project doesn't have the Generative Language API enabled. " +
          "Try a known-public video first: if that works, it was the video.",
      );
    }
    if (lastStatus === 429) {
      throw new Error(
        "Gemini rate limit hit. Wait a minute and click Retry — long videos count against the daily YouTube quota.",
      );
    }
    throw new Error(`Gemini ${lastStatus}: ${lastBody.slice(0, 400)}`);
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
  };
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
}

function segmentPrompt(startSeconds: number, endSeconds: number): string {
  return `You are transcribing a podcast episode from video.

Transcribe EVERYTHING spoken between ${fmtClock(startSeconds)} and ${fmtClock(endSeconds)} of this video, verbatim.

Rules:
- Output plain text lines in the form "[HH:MM:SS] Speaker: what they said".
- Timestamps are ABSOLUTE positions in the full video (this window starts at ${fmtClock(startSeconds)}), not offsets from the start of the window.
- Start a new line every time the speaker changes, and at least every 30 seconds.
- Label speakers consistently: "Host", "Guest", or their real name if it is said out loud.
- Transcribe what is actually said. Do not summarise, do not clean up meaning, do not invent dialogue.
- Keep the original language of the episode.
- If the video ENDS before ${fmtClock(startSeconds)} — that is, there is no content at all in this window — reply with exactly ${NO_CONTENT} and nothing else.

Return only the transcript lines.`;
}

function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/**
 * Transcribe one window of the video. `segment` is 0-based; each covers
 * SEGMENT_MINUTES of runtime.
 */
export async function transcribeSegment(
  videoId: string,
  segment: number,
): Promise<SegmentResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const startSeconds = segment * SEGMENT_MINUTES * 60;
  const endSeconds = startSeconds + SEGMENT_MINUTES * 60;

  const body = {
    contents: [
      {
        parts: [
          { text: segmentPrompt(startSeconds, endSeconds) },
          {
            file_data: { file_uri: watchUrl(videoId) },
            // Durations go over REST in protobuf's canonical string form
            // ("1200s") — the {seconds} object form is not accepted.
            video_metadata: {
              start_offset: `${startSeconds}s`,
              end_offset: `${endSeconds}s`,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 16384,
      // Audio is what matters for a transcript; low video resolution keeps the
      // token cost of an hour-long episode sane.
      mediaResolution: "MEDIA_RESOLUTION_LOW",
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  const text = (await callWithRetry(TRANSCRIBE_MODEL, apiKey, body)).trim();
  if (!text || text.toUpperCase().startsWith(NO_CONTENT)) {
    return { text: "", ended: true };
  }
  const cleaned = text.replace(new RegExp(`\\s*${NO_CONTENT}\\s*$`, "i"), "").trim();
  // A window that comes back much shorter than its runtime means we ran off
  // the end of the video partway through — no need to ask for another one.
  const ended = cleaned.length < 400;
  return { text: cleaned, ended };
}

export interface ThumbnailIdea {
  headline: string;
  reason: string;
}

const HEADLINE_PROMPT = `You are a YouTube thumbnail strategist for a podcast channel.

Read the episode transcript below and write 3 DIFFERENT thumbnail headlines for it.

Each headline must be:
- SHORT: 2-4 words, hard max 5.
- High-CTR: curiosity- or benefit-driven, built on the single most compelling hook in the episode.
- Credible: lightly clickbait, never cheesy or spammy.
- Written in the episode's own language.

Return ONLY valid JSON, no markdown:
{"ideas":[{"headline":"...","reason":"one sentence on why this hook works"}]}`;

/** Three short thumbnail headlines drawn from the episode itself. */
export async function thumbnailIdeas(
  transcript: string,
  episodeTitle: string,
  variationHint?: string,
): Promise<ThumbnailIdea[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const body = {
    contents: [
      {
        parts: [
          { text: HEADLINE_PROMPT },
          {
            text: `Episode title: ${episodeTitle || "(untitled)"}\n\nTranscript:\n${transcript.slice(
              0,
              24000,
            )}${variationHint ? `\n\n${variationHint}` : ""}\n\nReturn the JSON now.`,
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.9,
      maxOutputTokens: 1024,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  const text = await callWithRetry(TRANSCRIBE_MODEL, apiKey, body);
  let parsed: { ideas?: ThumbnailIdea[] };
  try {
    parsed = JSON.parse(extractJson(text)) as { ideas?: ThumbnailIdea[] };
  } catch {
    throw new Error("Gemini returned a headline response we couldn't read. Try again.");
  }
  const ideas = Array.isArray(parsed.ideas) ? parsed.ideas : [];
  return ideas
    .map((i) => ({
      headline: String(i.headline ?? "").slice(0, 60).trim(),
      reason: String(i.reason ?? ""),
    }))
    .filter((i) => i.headline)
    .slice(0, 3);
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}
