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

export const ENHANCE_PROMPT_DEFAULT =
  "Enhance this image for use as a YouTube thumbnail. Goal: maximize visual punch at small sizes. Apply these adjustments while keeping the same composition, the same people's faces, the same expressions, and the same framing: dramatically increase sharpness and crispness; boost apparent resolution and fine micro-detail (skin texture, eye highlights, hair strands, fabric); push contrast and color saturation to vivid but still natural levels; brighten the subject and add a subtle key light feel; deepen the darker tones to give the subject more pop; clean up noise and compression artifacts. Do NOT add, remove, redraw, or rearrange any objects, people, faces, or backgrounds. Return only the enhanced image as a high-resolution JPEG/PNG.";
