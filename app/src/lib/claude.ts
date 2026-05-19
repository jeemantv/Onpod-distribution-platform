// Claude Sonnet 4 — generate AI content package from a transcript.
// Spec §6.4. Uses Anthropic Messages API directly, no SDK.

export interface AIPackage {
  title: string;
  description: string;
  tags: string[];
  hashtags: string[];
  language: string;
  chapters: string;
  summary: string;
}

const SYSTEM_PROMPT = `You are a podcast content strategist for OnPod Studios. You generate publish-ready metadata packages from raw podcast transcripts. You return ONLY valid JSON — no preamble, no markdown fences, no commentary.`;

function buildUserPrompt(transcript: string, chaptersHint: string): string {
  return `Based on this podcast transcript, generate a complete YouTube + content package.

Return JSON with this exact shape:
{
  "title": "compelling YouTube title under 70 chars",
  "description": "engaging 200-300 word YouTube description with hook, key takeaways, and CTA",
  "tags": ["tag1","tag2", ...],
  "hashtags": ["#hashtag1", ...],
  "language": "<detected language name>",
  "chapters": "00:00 Intro\\n02:15 Topic one\\n...",
  "summary": "2-3 sentence summary"
}

Constraints:
- title: <= 70 chars
- description: 200-300 words, multi-paragraph, ends with a CTA
- tags: 12-15 short SEO terms (no hashes, no quotes)
- hashtags: 8 short hashtags starting with #
- chapters: Use real timestamps from the transcript paragraphs below if any are provided; otherwise infer from semantic breaks. First chapter MUST be 00:00.

Reference chapter timestamps (use as anchors, refine titles):
${chaptersHint || "(none — derive from transcript)"}

Transcript:
${transcript}`;
}

export async function generateAIPackage(
  transcript: string,
  chaptersHint: string = "",
): Promise<AIPackage> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  // Cap transcript to avoid blowing the prompt budget on hour-long podcasts.
  // Sonnet 4 has 200k context; ~120k chars is a safe ceiling.
  const trimmed =
    transcript.length > 120_000
      ? transcript.slice(0, 120_000) + "\n\n[... transcript truncated]"
      : transcript;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: buildUserPrompt(trimmed, chaptersHint) },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = data.content?.find((c) => c.type === "text")?.text ?? "";

  const jsonStr = extractJson(text);
  let parsed: Partial<AIPackage>;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    throw new Error(
      `Claude returned non-JSON: ${(err as Error).message}\n---\n${text.slice(0, 400)}`,
    );
  }

  return {
    title: String(parsed.title ?? "Untitled episode").slice(0, 100),
    description: String(parsed.description ?? ""),
    tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
    hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.map(String) : [],
    language: String(parsed.language ?? "English"),
    chapters: String(parsed.chapters ?? ""),
    summary: String(parsed.summary ?? ""),
  };
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

export async function regenerateField(
  transcript: string,
  field: keyof AIPackage,
  customPrompt: string | undefined,
  existing: AIPackage,
): Promise<string | string[]> {
  // Spec §6.5 — focused regen for one field
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const user = `You wrote this AI content for a podcast. Regenerate ONLY the "${field}" field.
${customPrompt ? `User direction: ${customPrompt}` : ""}

Current package:
${JSON.stringify(existing, null, 2)}

Transcript (truncated):
${transcript.slice(0, 60_000)}

Return JSON: { "${field}": <new value, same type as before> }`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = data.content?.find((c) => c.type === "text")?.text ?? "";
  const parsed = JSON.parse(extractJson(text)) as Record<string, unknown>;
  return parsed[field] as string | string[];
}
