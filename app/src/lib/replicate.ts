// Replicate API client for image enhancement. Defaults to
// nightmareai/real-esrgan which is the best general-purpose photo
// upscaler and runs in ~5-15 seconds per image.

const BASE = "https://api.replicate.com/v1";
// Pinned model version for real-esrgan. The owner has tagged this
// release as stable; if you need to bump it, look at
// https://replicate.com/nightmareai/real-esrgan/versions
const REAL_ESRGAN_VERSION =
  "f121d640bd286e1fdc67f9799164c1d5be36ff74576ee11c803ae5b665dd46aa";

interface RunOutput {
  imageUrl: string;
}

async function runPrediction(
  apiToken: string,
  version: string,
  input: Record<string, unknown>,
): Promise<RunOutput> {
  // Replicate's create endpoint can flake on cold starts. Try up to 3
  // times before giving up — each attempt starts a fresh prediction
  // and gets its own server-side wait window.
  const MAX_ATTEMPTS = 3;
  let lastErr: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const create = await fetch(`${BASE}/predictions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
          Prefer: "wait=55",
        },
        body: JSON.stringify({ version, input }),
      });
      if (!create.ok) {
        throw new Error(
          `Replicate create ${create.status}: ${(await create.text()).slice(0, 300)}`,
        );
      }
      let pred = (await create.json()) as {
        id: string;
        status: string;
        output?: string | string[] | null;
        error?: string;
        urls?: { get?: string };
      };

      // Poll until terminal.
      for (let i = 0; i < 30 && pred.status !== "succeeded" && pred.status !== "failed"; i++) {
        if (!pred.urls?.get) break;
        await new Promise((r) => setTimeout(r, 1500));
        const poll = await fetch(pred.urls.get, {
          headers: { Authorization: `Bearer ${apiToken}` },
          cache: "no-store",
        });
        if (!poll.ok) break;
        pred = (await poll.json()) as typeof pred;
      }
      if (pred.status === "failed") {
        throw new Error(`Replicate prediction failed: ${pred.error ?? "no error"}`);
      }
      if (pred.status !== "succeeded") {
        throw new Error(`Replicate still ${pred.status} after polling`);
      }
      const out = pred.output;
      const url = Array.isArray(out) ? out[0] : out;
      if (!url || typeof url !== "string") {
        throw new Error("Replicate returned no image URL");
      }
      return { imageUrl: url };
    } catch (err) {
      lastErr = err as Error;
      if (attempt < MAX_ATTEMPTS) {
        // Linear backoff: 1s, 2s
        await new Promise((r) => setTimeout(r, attempt * 1000));
        continue;
      }
    }
  }
  throw lastErr ?? new Error("Replicate failed");
}

export interface UpscaleResult {
  buf: Buffer;
  mime: string;
}

/**
 * Upscale a public image URL via Real-ESRGAN.
 * - scale: 2 (faster) or 4 (sharper). Default 2.
 * - face_enhance: true → also runs GFPGAN for face fidelity.
 */
export async function upscaleImage(args: {
  imageUrl: string;
  scale?: 2 | 4;
  faceEnhance?: boolean;
}): Promise<UpscaleResult> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN not set");
  const { imageUrl } = await runPrediction(token, REAL_ESRGAN_VERSION, {
    image: args.imageUrl,
    scale: args.scale ?? 2,
    face_enhance: args.faceEnhance ?? true,
  });
  // Fetch the upscaled image bytes
  const r = await fetch(imageUrl);
  if (!r.ok) {
    throw new Error(`Upscaled fetch ${r.status}`);
  }
  const buf = Buffer.from(await r.arrayBuffer());
  const mime = r.headers.get("content-type") ?? "image/png";
  return { buf, mime };
}
