// Bannerbear API client — template-driven image generation.
//
// Set BANNERBEAR_API_KEY (project-scoped key from Bannerbear dashboard).
// Templates are created in the Bannerbear UI; each has named layers like
// "title", "subtitle", "image" that we override per call.
//
// Sync mode (recommended for our 1-image use case): use the
// /v2/images?force=true endpoint variant with `synchronous: true` — Bannerbear
// returns the rendered image URL in the same response when the template
// renders fast enough.

const API = "https://api.bannerbear.com/v2";
const SYNC_API = "https://sync.api.bannerbear.com/v2";

export interface BannerbearTemplate {
  uid: string;
  name: string;
  preview_url?: string;
  available_modifications?: { name: string; type: string }[];
}

export interface BannerbearModification {
  name: string;
  text?: string;
  image_url?: string;
  color?: string;
  background?: string;
}

export interface BannerbearImage {
  uid: string;
  status: "pending" | "completed" | "failed";
  image_url?: string;
  image_url_png?: string;
  image_url_jpg?: string;
  self?: string;
}

function authHeaders(): Record<string, string> {
  const key = process.env.BANNERBEAR_API_KEY;
  if (!key) throw new Error("BANNERBEAR_API_KEY not configured");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

export async function listTemplates(): Promise<BannerbearTemplate[]> {
  const res = await fetch(`${API}/templates?limit=100`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Bannerbear templates ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as BannerbearTemplate[];
}

export async function getTemplate(uid: string): Promise<BannerbearTemplate> {
  const res = await fetch(`${API}/templates/${uid}`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Bannerbear template ${uid}: ${res.status}`);
  }
  return (await res.json()) as BannerbearTemplate;
}

/**
 * Generate an image synchronously. Returns the JPG URL when ready.
 * Bannerbear's sync endpoint usually completes within a few seconds for
 * standard templates; on timeout we fall back to async + poll.
 */
export async function generateImage(args: {
  templateId: string;
  modifications: BannerbearModification[];
  webhookUrl?: string;
}): Promise<BannerbearImage> {
  const syncRes = await fetch(`${SYNC_API}/images`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      template: args.templateId,
      modifications: args.modifications,
      webhook_url: args.webhookUrl,
    }),
  });
  if (syncRes.ok) {
    return (await syncRes.json()) as BannerbearImage;
  }
  // Fall back to async + poll
  if (syncRes.status === 408 || syncRes.status === 504) {
    return generateImageAsync({
      templateId: args.templateId,
      modifications: args.modifications,
      webhookUrl: args.webhookUrl,
    });
  }
  throw new Error(`Bannerbear sync ${syncRes.status}: ${await syncRes.text()}`);
}

async function generateImageAsync(args: {
  templateId: string;
  modifications: BannerbearModification[];
  webhookUrl?: string;
}): Promise<BannerbearImage> {
  const create = await fetch(`${API}/images`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      template: args.templateId,
      modifications: args.modifications,
      webhook_url: args.webhookUrl,
    }),
  });
  if (!create.ok) {
    throw new Error(`Bannerbear async ${create.status}: ${await create.text()}`);
  }
  const initial = (await create.json()) as BannerbearImage;

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const poll = await fetch(`${API}/images/${initial.uid}`, {
      headers: authHeaders(),
      cache: "no-store",
    });
    if (!poll.ok) continue;
    const data = (await poll.json()) as BannerbearImage;
    if (data.status === "completed" || data.status === "failed") return data;
  }
  return initial;
}
