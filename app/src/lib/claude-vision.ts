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
