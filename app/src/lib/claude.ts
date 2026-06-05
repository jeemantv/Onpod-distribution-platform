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

export type ArticleFormat =
  | "linkedin"
  | "wordpress"
  | "newsletter"
  | "seoBlog";

const ARTICLE_GUIDES: Record<ArticleFormat, { length: string; tone: string; structure: string }> = {
  linkedin: {
    length: "150-250 words, and keep it under 1,300 characters so it fits before LinkedIn's 'see more' cut",
    tone: "professional, opinion-led, first person, contrarian hook, ends with a question to drive comments",
    structure:
      "Format it as a native LinkedIn post that pastes in clean (LinkedIn has NO bold, italics, or markdown). Line 1: a punchy hook of 5 to 9 words that works as the preview line. Then a blank line. Then write in SHORT standalone lines: one or at most two sentences per line, with a BLANK LINE between every line so the post is airy and scannable on mobile. No paragraph should be more than two sentences. End with a single question on its own line to drive comments, then a blank line, then 4 to 6 relevant hashtags on one line.",
  },
  wordpress: {
    length: "800-1500 words",
    tone: "informative, SEO-friendly, scannable, mid-funnel",
    structure: "Title on its own line in plain Title Case (no # symbol). Intro paragraph. 3 to 5 sections, each starting with the section name on its own line in Title Case, then body paragraphs. Conclusion. After the conclusion, leave one blank line and add 'Meta description:' followed by 1 sentence.",
  },
  newsletter: {
    length: "500-800 words",
    tone: "conversational, direct, 'just sent from my desk'",
    structure: "Greeting line. Single big insight in 2 to 3 paragraphs. 2 to 3 supporting points written as short paragraphs (NOT bullets). Soft CTA. Signature line.",
  },
  seoBlog: {
    length: "1200-2000 words",
    tone: "authoritative, keyword-rich without being spammy",
    structure: "Title in plain Title Case on its own line. Intro that names the problem and the answer in 2 to 3 sentences. 4 to 6 sections, each starting with the section name in Title Case on its own line. FAQ section at the end as 3 to 5 question/answer pairs (each question and answer on its own paragraph).",
  },
};

const ARTICLE_LABEL: Record<ArticleFormat, string> = {
  linkedin: "LinkedIn post",
  wordpress: "WordPress article",
  newsletter: "Email newsletter",
  seoBlog: "SEO blog post",
};

export async function generateArticle(
  format: ArticleFormat,
  transcript: string,
  ai: AIPackage,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const guide = ARTICLE_GUIDES[format];
  const trimmed =
    transcript.length > 100_000
      ? transcript.slice(0, 100_000) + "\n\n[... truncated]"
      : transcript;

  const user = `Write a ${ARTICLE_LABEL[format]} from this podcast transcript.

Episode title: ${ai.title}
Episode summary: ${ai.summary}

Format:
- Length: ${guide.length}
- Tone: ${guide.tone}
- Structure: ${guide.structure}

WRITE LIKE A HUMAN. DO NOT WRITE LIKE AI. Hard bans, no exceptions:

1. NO em-dashes (—) or en-dashes (–). Use a comma, a period, or "and"/"but".
2. NO markdown headings. Do not use #, ##, ### anywhere. Section titles go on their own line in Title Case, plain text.
3. NO asterisks. Do not use *, ** or *** for bold/italic/bullets.
4. NO bullet points or numbered lists with -, *, or 1./2./3. Write supporting points as actual paragraphs.
5. NO AI filler phrases. Banned: "In today's fast-paced world", "It's important to note", "Let's dive in", "Ultimately", "In conclusion,", "At the end of the day", "It's worth noting", "Furthermore", "Moreover", "Additionally", "On the other hand", "That being said", "delve", "tapestry", "landscape" (figuratively), "navigate" (figuratively), "unlock", "leverage" (verb), "elevate" (figuratively).
6. NO "I" if the format is third-person. NO "we" unless it's a newsletter or it appears in the transcript that way.
7. Vary sentence length on purpose. Short sentence. Then a longer one that earns its length by carrying a single idea. Avoid three-clause sentences with multiple conjunctions.
8. Use the speaker's actual phrases and arguments where possible. Quote them inline with regular quotation marks.
9. Do not invent facts. If the transcript doesn't say it, do not say it.

Return only the article text. No preamble, no commentary, no "Here's the article".

Transcript:
${trimmed}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 4000,
      system:
        "You are a senior content writer. You write articles from podcast transcripts that sound like a real person wrote them. You do not use em-dashes, markdown headings (#), asterisks (*), bullet points, or AI filler phrases. You vary sentence length deliberately. You quote the speaker rather than paraphrasing when their phrasing is good. You never invent facts.",
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude article ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }
  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = data.content?.find((c) => c.type === "text")?.text ?? "";
  // Strip leading fenced code block if Claude wraps the whole thing
  let out = text.replace(/^```(?:markdown|md)?\n([\s\S]*?)\n```$/m, "$1").trim();
  // Belt-and-suspenders: strip any em-dashes / heading hashes / leftover asterisks
  // Claude might emit despite the prompt
  out = out
    .replace(/[—–]/g, ", ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/  +/g, " ")
    .trim();
  return out;
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
