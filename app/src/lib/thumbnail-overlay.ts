// Deterministic graphic title overlay for thumbnails. Composites a bold,
// outlined, shadowed title onto a base image with a real bundled font, so a
// title ALWAYS appears (correctly spelled, crisp) even when the Gemini image
// model's drawn-title pass fails or is unavailable.

import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import type { SKRSContext2D } from "@napi-rs/canvas";
import { ANTON_TTF_BASE64 } from "./assets/anton-font";

const FONT_FAMILY = "ThumbTitle";
let fontReady = false;
function ensureFont() {
  if (fontReady) return;
  GlobalFonts.register(Buffer.from(ANTON_TTF_BASE64, "base64"), FONT_FAMILY);
  fontReady = true;
}

const W = 1280;
const H = 720; // 16:9, YouTube's recommended thumbnail size.

// Greedy word-wrap into at most `maxLines` lines at the given font size,
// returning the lines if they all fit `maxWidth`, else null (caller shrinks).
function wrapLines(
  ctx: SKRSContext2D,
  words: string[],
  maxWidth: number,
  maxLines: number,
): string[] | null {
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines) return null;
    }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) return null;
  // A single word longer than maxWidth can't be wrapped — reject so we shrink.
  for (const l of lines) if (ctx.measureText(l).width > maxWidth) return null;
  return lines;
}

export async function overlayTitle(
  baseImage: Buffer,
  title: string,
): Promise<Buffer> {
  ensureFont();
  const text = title.trim().toUpperCase();
  if (!text) return baseImage;

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Cover-fit the base image into the 16:9 canvas (crop overflow, centered).
  const img = await loadImage(baseImage);
  const scale = Math.max(W / img.width, H / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);

  // Darkening gradient across the TOP so the title stays legible over any
  // background (the title sits in the upper band, like the reference).
  const grad = ctx.createLinearGradient(0, 0, 0, H * 0.55);
  grad.addColorStop(0, "rgba(0,0,0,0.55)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Auto-fit the title: shrink the font until it wraps into <= 2 lines within
  // the safe width.
  const maxWidth = W * 0.92;
  let fontSize = 150;
  let lines: string[] | null = null;
  const words = text.split(/\s+/);
  for (; fontSize >= 52; fontSize -= 4) {
    ctx.font = `${fontSize}px "${FONT_FAMILY}"`;
    lines = wrapLines(ctx, words, maxWidth, 2);
    if (lines) break;
  }
  if (!lines) {
    ctx.font = `52px "${FONT_FAMILY}"`;
    lines = [text];
  }

  const lineHeight = fontSize * 1.02;
  // Centered across the top, like a glowing studio sign.
  let y = 64 + fontSize * 0.82;
  const x = W / 2;

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;

  for (const line of lines) {
    // Neon glow halo (electric cyan), drawn under the outline + fill.
    ctx.shadowColor = "rgba(34,211,238,0.95)";
    ctx.shadowBlur = fontSize * 0.5;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Thin dark edge to keep the letters crisp over bright areas.
    ctx.lineWidth = Math.max(5, fontSize * 0.1);
    ctx.strokeStyle = "#053640";
    ctx.strokeText(line, x, y);

    // Cyan fill, glow still on, for a saturated neon core.
    ctx.fillStyle = "#22d3ee";
    ctx.fillText(line, x, y);

    // Bright inner fill with no shadow for a crisp, lit highlight.
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#b8f4ff";
    ctx.fillText(line, x, y);

    y += lineHeight;
  }

  return canvas.toBuffer("image/jpeg", 0.92);
}
