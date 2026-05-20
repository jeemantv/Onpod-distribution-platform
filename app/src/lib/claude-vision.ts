// Claude Sonnet 4.5 vision: pick the best thumbnail frames from a set of
// candidate frames extracted from a podcast video.

export interface PickedFrame {
  index: number;
  label: string;
  reason: string;
}

const SYSTEM_PROMPT = `You are picking thumbnail frames for a podcast YouTube video. You will be shown N candidate frames extracted at evenly-spaced timestamps. Pick the 3 best for thumbnails:

1. "group" — the single best frame showing ALL speakers together with clear faces
2. "primary" — the best close-up of the primary speaker (most prominent / left-side / host)
3. "secondary" — the best close-up of the second speaker (guest / right-side), OR if there's only one person, the best alternate angle/expression

Return ONLY valid JSON. No preamble, no markdown.

For each, return: {"index": <0-based frame index>, "label": "group|primary|secondary", "reason": "short why"}

If a category has no good candidate, omit it. The "primary" and "secondary" should be different people if possible.`;

export async function pickThumbnailFrames(
  framesBase64Jpeg: string[],
): Promise<PickedFrame[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const content: Array<Record<string, unknown>> = [];
  framesBase64Jpeg.forEach((b64, i) => {
    content.push({ type: "text", text: `Frame ${i}:` });
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: b64 },
    });
  });
  content.push({
    type: "text",
    text: `Pick the best frames as described. Total frames: ${framesBase64Jpeg.length}. Return: {"picks": [{"index":0,"label":"group","reason":"…"}, ...]}`,
  });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude vision ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }
  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = data.content?.find((c) => c.type === "text")?.text ?? "";

  const jsonStr = extractJson(text);
  const parsed = JSON.parse(jsonStr) as { picks?: PickedFrame[] };
  const picks = Array.isArray(parsed.picks) ? parsed.picks : [];

  // Validate indices and label values
  return picks
    .filter((p) => Number.isInteger(p.index) && p.index >= 0 && p.index < framesBase64Jpeg.length)
    .map((p) => ({
      index: p.index,
      label: p.label,
      reason: String(p.reason ?? ""),
    }));
}

export interface FoundPerson {
  frameIndex: number;
  // Bounding box in normalized 0..1 coordinates of the source frame
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  confidence: number;
}

const FIND_PEOPLE_PROMPT = `You are analyzing video frames from a podcast recording to find clean portraits of each distinct person on camera. You will see N frames (numbered 0..N-1). Find up to 4 distinct people across all frames.

For each person, pick the SINGLE best frame showing them most clearly, and return a tight bounding box around their head AND upper torso suitable for a YouTube thumbnail cutout. The box should:
- Include the full head with some headroom above the hair
- Include shoulders and upper chest (don't cut off at the neck)
- Be tight on the sides (no extra empty space)
- Be returned in normalized coordinates 0..1 relative to the frame

Return ONLY valid JSON, no preamble or markdown:
{"people":[{"frameIndex":<int>,"x":0..1,"y":0..1,"width":0..1,"height":0..1,"label":"host|guest|person 3|person 4","confidence":0..1}]}

If only one person is visible, return one entry. If two, return two. Up to 4 max. Skip very low-confidence detections.`;

export async function findPeopleInFrames(
  framesBase64Jpeg: string[],
): Promise<FoundPerson[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const content: Array<Record<string, unknown>> = [];
  framesBase64Jpeg.forEach((b64, i) => {
    content.push({ type: "text", text: `Frame ${i}:` });
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: b64 },
    });
  });
  content.push({
    type: "text",
    text: `Identify up to 4 distinct people. Total frames: ${framesBase64Jpeg.length}.`,
  });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 1200,
      system: FIND_PEOPLE_PROMPT,
      messages: [{ role: "user", content }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude vision ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }
  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = data.content?.find((c) => c.type === "text")?.text ?? "";
  const jsonStr = extractJson(text);
  const parsed = JSON.parse(jsonStr) as { people?: FoundPerson[] };
  const people = Array.isArray(parsed.people) ? parsed.people : [];
  return people
    .filter(
      (p) =>
        Number.isInteger(p.frameIndex) &&
        p.frameIndex >= 0 &&
        p.frameIndex < framesBase64Jpeg.length &&
        p.x >= 0 &&
        p.y >= 0 &&
        p.width > 0 &&
        p.height > 0 &&
        p.x + p.width <= 1.01 &&
        p.y + p.height <= 1.01,
    )
    .slice(0, 4);
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
