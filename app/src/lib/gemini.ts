// Gemini image enhancement via the Generative Language API.
// Model: gemini-2.5-flash-image (a.k.a. "Nano Banana"). Requires billing
// enabled on the Google Cloud project associated with the API key.

const MODEL = "gemini-2.5-flash-image";
const BASE = "https://generativelanguage.googleapis.com/v1beta";

export interface EnhanceResult {
  mimeType: string;
  base64: string;
}

export async function enhanceImage(
  inputBase64: string,
  inputMimeType: string,
  prompt: string,
): Promise<EnhanceResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  const res = await fetch(
    `${BASE}/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: { mime_type: inputMimeType, data: inputBase64 },
              },
            ],
          },
        ],
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429 || /quota/i.test(text)) {
      throw new Error(
        "Gemini billing not enabled. Go to https://aistudio.google.com/app/apikey, open the project linked to your API key, and enable billing on it.",
      );
    }
    throw new Error(`Gemini ${res.status}: ${text.slice(0, 400)}`);
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
  "Enhance this podcast thumbnail photograph. Make it sharper. Increase apparent resolution and fine detail. Improve lighting and color while keeping it natural. Keep the same composition, the same people's faces and expressions, the same framing, and the same overall look. Do not add or remove anything from the scene. Return only the enhanced image.";
