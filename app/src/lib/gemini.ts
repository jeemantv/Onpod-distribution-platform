// Gemini image enhancement via the Generative Language API.
// Model: gemini-2.5-flash-image (a.k.a. "Nano Banana"). Requires billing
// enabled on the Google Cloud project associated with the API key.

const MODEL = "gemini-2.5-flash-image";
const BASE = "https://generativelanguage.googleapis.com/v1beta";

export interface EnhanceResult {
  mimeType: string;
  base64: string;
}

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const FALLBACK_MODELS = ["gemini-3.1-flash-image-preview", "gemini-3-pro-image-preview"] as const;

async function callGemini(
  model: string,
  apiKey: string,
  body: unknown,
): Promise<Response> {
  return fetch(`${BASE}/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function enhanceImage(
  inputBase64: string,
  inputMimeType: string,
  prompt: string,
): Promise<EnhanceResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const body = {
    contents: [
      {
        parts: [
          { text: prompt },
          { inline_data: { mime_type: inputMimeType, data: inputBase64 } },
        ],
      },
    ],
  };

  // Retry pattern. Tight backoff so we stay under Vercel's 60s function
  // timeout while still catching transient 503s.
  const attempts: { model: string; delayMs: number }[] = [
    { model: MODEL, delayMs: 0 },
    { model: MODEL, delayMs: 1500 },
    { model: FALLBACK_MODELS[0], delayMs: 1000 },
    { model: FALLBACK_MODELS[1], delayMs: 1000 },
  ];

  let lastStatus = 0;
  let lastBody = "";
  let res: Response | null = null;
  for (const a of attempts) {
    if (a.delayMs > 0) await new Promise((r) => setTimeout(r, a.delayMs));
    res = await callGemini(a.model, apiKey, body);
    if (res.ok) break;
    lastStatus = res.status;
    lastBody = await res.text();
    if (!RETRY_STATUSES.has(res.status)) break;
  }
  if (!res || !res.ok) {
    if (lastStatus === 429 && /free.tier|billing/i.test(lastBody)) {
      throw new Error(
        "Gemini billing not enabled. Go to https://aistudio.google.com/app/apikey, open the project linked to your API key, and enable billing.",
      );
    }
    if (lastStatus === 503) {
      throw new Error(
        "Gemini is overloaded right now (tried 4 times across two models). Wait a couple minutes and click Enhance again.",
      );
    }
    throw new Error(`Gemini ${lastStatus}: ${lastBody.slice(0, 400)}`);
  }
  const data = (await res.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inline_data?: { mime_type?: string; data?: string };
          inlineData?: { mimeType?: string; data?: string };
          text?: string;
        }>;
      };
    }>;
  };
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  for (const p of parts) {
    const a = p.inline_data;
    const b = p.inlineData;
    if (a?.data) {
      return { mimeType: a.mime_type ?? "image/png", base64: a.data };
    }
    if (b?.data) {
      return { mimeType: b.mimeType ?? "image/png", base64: b.data };
    }
  }
  // If we only got text back, that's a model refusal or non-image response
  const text = parts.find((p) => p.text)?.text ?? "(empty)";
  throw new Error(`Gemini returned no image. Text: ${text.slice(0, 200)}`);
}

// ---------------------------------------------------------------------------
// Thumbnail picking from video frames + episode transcript.
//
// Unlike enhanceImage (an image model), this uses a text/vision reasoning
// model so it can read the transcript and explain WHY each frame is a strong
// thumbnail for this specific episode — not just "has a clear face".
// ---------------------------------------------------------------------------

const THUMB_PICK_MODELS = ["gemini-2.5-flash"] as const;
const TRANSCRIPT_CHAR_CAP = 24000;

export interface SmartThumbPick {
  index: number; // 0-based frame index
  rank: number; // 1 = best
  headline: string; // short punchy overlay idea drawn from the episode hook
  reason: string; // one-sentence why
  // Where the title should sit in THIS frame — the area with the most empty
  // space and no face, so the text never covers anyone.
  placement?: "top" | "bottom" | "left" | "right";
}

const THUMB_PICK_PROMPT = `You are a YouTube thumbnail strategist for a podcast channel. You are given N candidate frames (numbered 0..N-1) extracted from the episode video, followed by the episode transcript.

Pick the 3 BEST frames to use as YouTube thumbnails. Judge each frame on BOTH:
- Visual quality: clear, sharp, well-framed faces; strong/expressive emotion; eye contact; good lighting. Reject blurry, mid-blink, motion-blurred, or awkward frames.
- Topical fit: how well the moment represents the most compelling, clickable hook of the episode according to the transcript.

For each pick provide:
- "rank": 1 (best) to 3
- "index": the 0-based frame index
- "headline": the on-thumbnail TITLE text. Make it a high-CTR YouTube podcast title: SHORT (ideally 2-4 words, hard max 5), punchy, curiosity- or benefit-driven, ALL-CAPS friendly. Work in the episode's main topic/keyword for SEO. Lightly clickbait but credible — never cheesy, spammy, or all-caps shouting nonsense. Examples of the vibe: "AI CHANGES EVERYTHING", "THE NETWORKING TRAP", "SCALE FASTER NOW".
- "reason": one sentence explaining the choice, referencing both the visual and the topic
- "placement": where a big title can sit in THIS frame WITHOUT covering anyone's face — one of "top", "bottom", "left", or "right". Look at where the people are: if faces are low/centered choose "top"; if faces are high choose "bottom"; if everyone is on one side choose the OTHER side ("left" or "right"). Pick the area with the most empty/negative space.

Return ONLY valid JSON, no markdown, no preamble:
{"picks":[{"rank":1,"index":0,"headline":"...","reason":"...","placement":"top"}]}

The 3 picks must have distinct frame indices.`;

export async function pickThumbnailsFromContext(
  framesBase64Jpeg: string[],
  transcript: string,
  episodeTitle?: string,
  // Free-text nudge for re-rolls: encourages different frames/titles than the
  // obvious first choice so "Redo" actually changes things.
  variationHint?: string,
): Promise<SmartThumbPick[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const trimmedTranscript = (transcript ?? "").trim().slice(0, TRANSCRIPT_CHAR_CAP);

  const parts: Array<Record<string, unknown>> = [{ text: THUMB_PICK_PROMPT }];
  framesBase64Jpeg.forEach((b64, i) => {
    parts.push({ text: `Frame ${i}:` });
    parts.push({ inline_data: { mime_type: "image/jpeg", data: b64 } });
  });
  parts.push({
    text: `Episode title: ${episodeTitle?.trim() || "(untitled)"}\n\nTranscript:\n${trimmedTranscript || "(transcript unavailable)"}\n\nTotal frames: ${framesBase64Jpeg.length}.${
      variationHint ? `\n\n${variationHint}` : ""
    } Return the JSON now.`,
  });

  const body = {
    contents: [{ parts }],
    generationConfig: {
      responseMimeType: "application/json",
      // Higher temperature so re-rolls genuinely explore different frames and
      // titles instead of converging on the same obvious pick.
      temperature: 0.9,
      // Headroom so the JSON is never truncated. Gemini 2.5 "thinking"
      // tokens count against this budget, so we also turn thinking OFF —
      // otherwise the model can spend the whole budget reasoning and emit
      // a half-finished string ("Unterminated string in JSON…").
      maxOutputTokens: 2048,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  const attempts: { model: string; delayMs: number }[] = [
    { model: THUMB_PICK_MODELS[0], delayMs: 0 },
    { model: THUMB_PICK_MODELS[0], delayMs: 1500 },
    { model: THUMB_PICK_MODELS[0], delayMs: 1500 },
  ];

  let lastStatus = 0;
  let lastBody = "";
  let res: Response | null = null;
  for (const a of attempts) {
    if (a.delayMs > 0) await new Promise((r) => setTimeout(r, a.delayMs));
    res = await callGemini(a.model, apiKey, body);
    if (res.ok) break;
    lastStatus = res.status;
    lastBody = await res.text();
    if (!RETRY_STATUSES.has(res.status)) break;
  }
  if (!res || !res.ok) {
    if (lastStatus === 429 && /free.tier|billing/i.test(lastBody)) {
      throw new Error(
        "Gemini billing not enabled. Go to https://aistudio.google.com/app/apikey, open the project linked to your API key, and enable billing.",
      );
    }
    if (lastStatus === 503) {
      throw new Error(
        "Gemini is overloaded right now (tried 3 times). Wait a couple minutes and try again.",
      );
    }
    throw new Error(`Gemini ${lastStatus}: ${lastBody.slice(0, 400)}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  let parsed: { picks?: SmartThumbPick[] };
  try {
    parsed = JSON.parse(extractJson(text)) as { picks?: SmartThumbPick[] };
  } catch {
    throw new Error(
      `Gemini returned a response we couldn't read. Try again. (${text.slice(0, 120)}…)`,
    );
  }
  const picks = Array.isArray(parsed.picks) ? parsed.picks : [];

  const seen = new Set<number>();
  return picks
    .filter(
      (p) =>
        Number.isInteger(p.index) &&
        p.index >= 0 &&
        p.index < framesBase64Jpeg.length &&
        !seen.has(p.index) &&
        seen.add(p.index) !== undefined,
    )
    .map((p, i) => ({
      index: p.index,
      rank: Number.isInteger(p.rank) ? p.rank : i + 1,
      headline: String(p.headline ?? "").slice(0, 80),
      reason: String(p.reason ?? ""),
      placement: (["top", "bottom", "left", "right"] as const).includes(
        p.placement as "top" | "bottom" | "left" | "right",
      )
        ? p.placement
        : undefined,
    }))
    .sort((a, b) => a.rank - b.rank)
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

// Three distinct thumbnail design styles — so the 3 AI suggestions each come
// back looking different (like the reference set), not 3 of the same look.
export const THUMBNAIL_STYLE_NAMES = ["Neon studio", "Bold minimal", "Punchy"] as const;

const STYLE_DIRECTIONS = [
  // 0 — Neon studio: glowing cyan title behind the subjects.
  `STYLE — "Neon studio": Add a HUGE bold condensed ALL-CAPS title in vivid electric cyan/blue with a bright NEON GLOW and a thin dark edge, spanning most of the width across the UPPER frame. Place the title BEHIND the people — the speakers, mics and desk overlap in FRONT of it like a glowing sign on the studio's back wall, while every face stays fully visible. Add a faint cyan rim light on the subjects and set.`,
  // 1 — Bold minimal: clean white stacked title, lots of negative space.
  `STYLE — "Bold minimal": Clean, premium, cinematic. Put a HUGE heavy ALL-CAPS sans-serif title in crisp WHITE, stacked on 2–3 short lines, along the EMPTIER side of the frame (away from the person). Use only a soft drop shadow for legibility — no busy outlines. Keep lots of negative space and warm, magazine-quality lighting; the subject stays sharp on the opposite side.`,
  // 2 — Punchy: high-energy MrBeast-style colored title.
  `STYLE — "Punchy": High-energy and clicky. Put a BIG chunky ALL-CAPS title across the TOP in a punchy bright color (golden yellow OR bold red) with a thick black-and-white outline and a strong drop shadow so it screams off the image. Push saturation and contrast hard, add a subtle vignette and dramatic lighting that emphasises the subject's expression. Eye-catching but still clean.`,
];

function styledThumbnailPrompt(
  title: string,
  style: number,
  notes?: string,
  placement?: "top" | "bottom" | "left" | "right",
): string {
  const direction = STYLE_DIRECTIONS[style] ?? STYLE_DIRECTIONS[0];
  const place = placement
    ? `\n\nPLACEMENT: position the title toward the ${placement.toUpperCase()} of the frame, in the empty space there. The title may sit BEHIND the people, but it must NEVER cover or cross anyone's FACE — every face stays fully visible.`
    : `\n\nThe title must NEVER cover or cross anyone's face — keep every face fully visible.`;
  const extra = notes?.trim()
    ? `\n\nUSER DIRECTION (follow this, it overrides the style defaults where they conflict): ${notes.trim()}`
    : "";
  return `You are designing a premium, high-CTR YouTube podcast thumbnail from this video still.

ENHANCE the image so it looks cinematic and high quality: sharpen and add fine detail, boost contrast and color to vivid-but-natural, brighten the subjects, clean up noise and compression. Keep the SAME people, faces, expressions, and framing — do not redraw, distort, add, or remove anyone.

The title must read EXACTLY: "${title}" — spell it exactly, ALL CAPS, and add no other text, logos, or watermarks.

${direction}${place}${extra}

Return only the finished, high-resolution 16:9 thumbnail image.`;
}

// Compose a finished thumbnail in one of the THUMBNAIL_STYLE_NAMES styles,
// using the Gemini image model (same engine as enhanceImage). Optional `notes`
// is free-text user direction; `placement` keeps the title off the faces.
export async function composeThumbnail(
  frameBase64Jpeg: string,
  title: string,
  style = 0,
  notes?: string,
  placement?: "top" | "bottom" | "left" | "right",
): Promise<EnhanceResult> {
  return enhanceImage(
    frameBase64Jpeg,
    "image/jpeg",
    styledThumbnailPrompt(title, style, notes, placement),
  );
}

export const ENHANCE_PROMPT_DEFAULT =
  "Enhance this image for use as a YouTube thumbnail. Goal: maximize visual punch at small sizes. Apply these adjustments while keeping the same composition, the same people's faces, the same expressions, and the same framing: dramatically increase sharpness and crispness; boost apparent resolution and fine micro-detail (skin texture, eye highlights, hair strands, fabric); push contrast and color saturation to vivid but still natural levels; brighten the subject and add a subtle key light feel; deepen the darker tones to give the subject more pop; clean up noise and compression artifacts. Do NOT add, remove, redraw, or rearrange any objects, people, faces, or backgrounds. Return only the enhanced image as a high-resolution JPEG/PNG.";
