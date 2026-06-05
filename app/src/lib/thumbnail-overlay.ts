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

// Per-style visual config, mirroring the 3 AI-draw styles so the font-overlay
// fallback also produces 3 distinct looks.
//   0 Neon studio  — cyan glow, centered top
//   1 Bold minimal — white, left-stacked, vertically centered
//   2 Punchy       — yellow with thick black outline, centered top
interface StyleCfg {
  align: "center" | "left";
  side: "top" | "leftMid";
  maxLines: number;
  startFont: number;
  minFont: number;
}
const STYLE_CFGS: StyleCfg[] = [
  { align: "center", side: "top", maxLines: 2, startFont: 150, minFont: 52 },
  { align: "left", side: "leftMid", maxLines: 3, startFont: 132, minFont: 48 },
  { align: "center", side: "top", maxLines: 2, startFont: 156, minFont: 56 },
];

export async function overlayTitle(
  baseImage: Buffer,
  title: string,
  style = 0,
): Promise<Buffer> {
  ensureFont();
  const cfg = STYLE_CFGS[style] ?? STYLE_CFGS[0];
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

  // Darkening scrim to keep the title legible — top band, or left band for
  // the left-stacked minimal style.
  if (cfg.side === "leftMid") {
    const g = ctx.createLinearGradient(0, 0, W * 0.6, 0);
    g.addColorStop(0, "rgba(0,0,0,0.6)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.55);
    g.addColorStop(0, "rgba(0,0,0,0.55)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
  }
  ctx.fillRect(0, 0, W, H);

  // Auto-fit: shrink until the title wraps within the style's line budget.
  const maxWidth = cfg.side === "leftMid" ? W * 0.5 : W * 0.92;
  let fontSize = cfg.startFont;
  let lines: string[] | null = null;
  const words = text.split(/\s+/);
  for (; fontSize >= cfg.minFont; fontSize -= 4) {
    ctx.font = `${fontSize}px "${FONT_FAMILY}"`;
    lines = wrapLines(ctx, words, maxWidth, cfg.maxLines);
    if (lines) break;
  }
  if (!lines) {
    ctx.font = `${cfg.minFont}px "${FONT_FAMILY}"`;
    lines = [text];
  }

  const lineHeight = fontSize * 1.02;
  const x = cfg.align === "left" ? 64 : W / 2;
  let y =
    cfg.side === "leftMid"
      ? (H - lineHeight * lines.length) / 2 + fontSize * 0.82
      : 64 + fontSize * 0.82;

  ctx.textAlign = cfg.align;
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;

  for (const line of lines) {
    if (style === 1) {
      // Bold minimal: clean white with a soft drop shadow, no outline.
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = fontSize * 0.14;
      ctx.shadowOffsetY = fontSize * 0.05;
      ctx.fillStyle = "#ffffff";
      ctx.fillText(line, x, y);
    } else if (style === 2) {
      // Punchy: golden-yellow with a thick black outline + drop shadow.
      ctx.shadowColor = "rgba(0,0,0,0.85)";
      ctx.shadowBlur = fontSize * 0.16;
      ctx.shadowOffsetY = fontSize * 0.06;
      ctx.lineWidth = Math.max(8, fontSize * 0.2);
      ctx.strokeStyle = "#0a0a0a";
      ctx.strokeText(line, x, y);
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.fillStyle = "#ffd21e";
      ctx.fillText(line, x, y);
    } else {
      // Neon studio: cyan glow + dark edge + bright inner fill.
      ctx.shadowColor = "rgba(34,211,238,0.95)";
      ctx.shadowBlur = fontSize * 0.5;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.lineWidth = Math.max(5, fontSize * 0.1);
      ctx.strokeStyle = "#053640";
      ctx.strokeText(line, x, y);
      ctx.fillStyle = "#22d3ee";
      ctx.fillText(line, x, y);
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#b8f4ff";
      ctx.fillText(line, x, y);
    }
    // Reset shadow between lines.
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    y += lineHeight;
  }

  return canvas.toBuffer("image/jpeg", 0.92);
}
