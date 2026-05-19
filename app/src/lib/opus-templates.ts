// Static OpusClip template registry. The list endpoint on api.opus.pro
// returns empty for our account, so we keep the known IDs here and use
// names → IDs in the UI.
//
// Preview loops (short MP4s) live in B2 at:
//   _assets/opus-previews/{id}.mp4
// Upload them via the OpusClip modal's "Upload preview" affordance.

export type OpusTemplateKind = "custom" | "preset";

export interface OpusTemplate {
  id: string;
  name: string;
  kind: OpusTemplateKind;
}

export const OPUS_TEMPLATES: OpusTemplate[] = [
  // ---------- Custom brand templates ----------
  { id: "653fcf34f2b9632a1520fd42", name: "testbrand", kind: "custom" },
  { id: "678c8e762bf38dfd0fd27511", name: "Book onpod studio logo", kind: "custom" },
  { id: "673467187e3d4f334ce4ec56", name: "drsam", kind: "custom" },
  { id: "683e6e29f24bb19056d1990a", name: "onpod1", kind: "custom" },
  { id: "68553b82b22b1d37372d8b33", name: "Yannick", kind: "custom" },
  { id: "672eee1933a8a97e1ecb16e4", name: "capital pod", kind: "custom" },

  // ---------- OpusClip preset templates ----------
  { id: "preset-fancy-Karaoke", name: "Karaoke", kind: "preset" },
  { id: "preset-fancy-Gameplay", name: "Gameplay", kind: "preset" },
  { id: "preset-fancy-Beasty", name: "Beasty", kind: "preset" },
  { id: "preset-fancy-Deep_Diver", name: "Deep Diver", kind: "preset" },
  { id: "preset-fancy-Youshaei", name: "Youshaei", kind: "preset" },
  { id: "preset-fancy-Pod_P", name: "Pod_P", kind: "preset" },
  { id: "preset-fancy-Mozi", name: "Mozi", kind: "preset" },
  { id: "preset-fancy-Popline", name: "Popline", kind: "preset" },
  { id: "preset-fancy-Simple", name: "Simple", kind: "preset" },
  { id: "preset-fancy-Think_Media", name: "Think Media", kind: "preset" },
];

export const PREVIEW_KEY_PREFIX = "_assets/opus-previews/";

export function previewKeyFor(templateId: string): string {
  // Sanitize for B2 path safety
  const safe = templateId.replace(/[^\w.-]/g, "_");
  return `${PREVIEW_KEY_PREFIX}${safe}.mp4`;
}
