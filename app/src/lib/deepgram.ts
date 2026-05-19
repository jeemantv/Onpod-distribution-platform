// Deepgram pre-recorded transcription. Spec §6.3.
// Server-side only. Uses fetch directly — no SDK dependency.

export interface DeepgramParagraph {
  start: number;
  end: number;
  text: string;
}

export interface DeepgramResult {
  transcript: string;
  language: string;
  durationSeconds: number;
  paragraphs: DeepgramParagraph[];
  requestId: string | null;
  raw: unknown;
}

interface DeepgramApiResponse {
  metadata?: { request_id?: string; duration?: number };
  results?: {
    channels?: Array<{
      detected_language?: string;
      alternatives?: Array<{
        transcript?: string;
        paragraphs?: {
          paragraphs?: Array<{
            start?: number;
            end?: number;
            sentences?: Array<{ text?: string; start?: number; end?: number }>;
          }>;
        };
      }>;
    }>;
  };
}

export async function transcribeFromUrl(
  sourceUrl: string,
): Promise<DeepgramResult> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error("DEEPGRAM_API_KEY not set");

  const params = new URLSearchParams({
    model: "nova-2",
    smart_format: "true",
    punctuate: "true",
    paragraphs: "true",
    detect_language: "true",
  });

  const res = await fetch(
    `https://api.deepgram.com/v1/listen?${params.toString()}`,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: sourceUrl }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Deepgram ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = (await res.json()) as DeepgramApiResponse;
  const channel = data.results?.channels?.[0];
  const alt = channel?.alternatives?.[0];
  const transcript = alt?.transcript ?? "";

  const paragraphs: DeepgramParagraph[] =
    alt?.paragraphs?.paragraphs?.map((p) => ({
      start: p.start ?? 0,
      end: p.end ?? 0,
      text: (p.sentences ?? []).map((s) => s.text ?? "").join(" ").trim(),
    })) ?? [];

  return {
    transcript,
    language: channel?.detected_language ?? "unknown",
    durationSeconds: data.metadata?.duration ?? 0,
    paragraphs,
    requestId: data.metadata?.request_id ?? null,
    raw: data,
  };
}

export function formatChaptersFromParagraphs(
  paragraphs: DeepgramParagraph[],
): string {
  // Pick every Nth paragraph to keep ~6-10 chapters total
  const target = Math.min(10, Math.max(3, Math.ceil(paragraphs.length / 4)));
  const step = Math.max(1, Math.floor(paragraphs.length / target));
  const picks = paragraphs.filter((_, i) => i % step === 0).slice(0, target);

  return picks
    .map((p) => {
      const mm = Math.floor(p.start / 60);
      const ss = Math.floor(p.start % 60);
      const stamp = `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
      const title = p.text.split(/[.?!]/)[0].slice(0, 60).trim() || "Chapter";
      return `${stamp} ${title}`;
    })
    .join("\n");
}
