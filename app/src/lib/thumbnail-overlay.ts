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

// How the letters are painted. `glow` set → neon 3-pass (halo + edge + bright
// core). `glow` null + `softShadow` → clean fill with a drop shadow.
interface Paint {
  fill: string;
  stroke: string;
  glow: string | null;
  bright: string | null;
  softShadow: boolean;
}
type Side = "top" | "bottom" | "leftMid" | "rightMid";

// Per-style visual config, mirroring the 3 AI-draw styles.
//   0 Neon studio  — cyan glow, centered top
//   1 Bold minimal — white, left-stacked, vertically centered
//   2 Punchy       — yellow with thick black outline, centered top
interface StyleCfg {
  align: "center" | "left";
  side: Side;
  maxLines: number;
  startFont: number;
  minFont: number;
  paint: Paint;
}
const NEON_PAINT: Paint = {
  fill: "#22d3ee",
  stroke: "#053640",
  glow: "rgba(34,211,238,0.95)",
  bright: "#b8f4ff",
  softShadow: false,
};
const STYLE_CFGS: StyleCfg[] = [
  { align: "center", side: "top", maxLines: 2, startFont: 150, minFont: 52, paint: NEON_PAINT },
  {
    align: "left",
    side: "leftMid",
    maxLines: 3,
    startFont: 132,
    minFont: 48,
    paint: { fill: "#ffffff", stroke: "transparent", glow: null, bright: null, softShadow: true },
  },
  {
    align: "center",
    side: "top",
    maxLines: 2,
    startFont: 156,
    minFont: 56,
    paint: { fill: "#ffd21e", stroke: "#0a0a0a", glow: null, bright: null, softShadow: true },
  },
];

// Named colours the user can type in "style notes" → a Paint. Vivid colours get
// a matching neon glow; white/black get a clean drop-shadow treatment.
function paintForColor(name: string): Paint | null {
  const neon = (fill: string, glow: string, stroke: string, bright: string): Paint => ({
    fill,
    stroke,
    glow,
    bright,
    softShadow: false,
  });
  switch (name) {
    case "cyan":
      return NEON_PAINT;
    case "red":
      return neon("#ff3b30", "rgba(255,59,48,0.9)", "#2a0606", "#ffd5d1");
    case "blue":
      return neon("#3b82f6", "rgba(59,130,246,0.9)", "#06182e", "#cfe0ff");
    case "green":
      return neon("#34d399", "rgba(52,211,153,0.9)", "#06281d", "#d3fff0");
    case "purple":
      return neon("#a855f7", "rgba(168,85,247,0.9)", "#1e0a33", "#ecd9ff");
    case "pink":
      return neon("#ec4899", "rgba(236,72,153,0.9)", "#320a22", "#ffd6ec");
    case "orange":
      return neon("#fb923c", "rgba(251,146,60,0.9)", "#2a1405", "#ffe2c6");
    case "yellow":
      return { fill: "#ffd21e", stroke: "#0a0a0a", glow: null, bright: null, softShadow: true };
    case "white":
      return { fill: "#ffffff", stroke: "transparent", glow: null, bright: null, softShadow: true };
    case "black":
      return { fill: "#111111", stroke: "#ffffff", glow: null, bright: null, softShadow: true };
    default:
      return null;
  }
}

export interface StyleNotesOverride {
  color?: string;
  placement?: Side;
}

// Parse free-text user notes (e.g. "red title at the bottom") into a colour +
// placement override for the font overlay.
export function parseStyleNotes(notes?: string): StyleNotesOverride {
  const n = (notes ?? "").toLowerCase();
  if (!n.trim()) return {};
  const colorWord = (
    [
      ["red", "red"],
      ["blue", "blue"],
      ["cyan", "cyan"],
      ["teal", "cyan"],
      ["yellow", "yellow"],
      ["gold", "yellow"],
      ["green", "green"],
      ["purple", "purple"],
      ["violet", "purple"],
      ["pink", "pink"],
      ["magenta", "pink"],
      ["orange", "orange"],
      ["white", "white"],
      ["black", "black"],
    ] as const
  ).find(([word]) => n.includes(word));
  let placement: Side | undefined;
  if (/\bbottom\b/.test(n)) placement = "bottom";
  else if (/\btop\b/.test(n)) placement = "top";
  else if (/\bleft\b/.test(n)) placement = "leftMid";
  else if (/\bright\b/.test(n)) placement = "rightMid";
  return { color: colorWord?.[1], placement };
}

export async function overlayTitle(
  baseImage: Buffer,
  title: string,
  style = 0,
  override?: StyleNotesOverride,
  // Transparent PNG of the foreground people. When provided it's drawn ON TOP
  // of the title so the text reads as sitting BEHIND their heads.
  foreground?: Buffer,
): Promise<Buffer> {
  ensureFont();
  const cfg = STYLE_CFGS[style] ?? STYLE_CFGS[0];
  const side: Side = override?.placement ?? cfg.side;
  const paint = (override?.color && paintForColor(override.color)) || cfg.paint;
  const align: "center" | "left" | "right" =
    side === "leftMid" ? "left" : side === "rightMid" ? "right" : cfg.align;
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

  // Darkening scrim near the title so it stays legible over any background.
  if (side === "leftMid") {
    const g = ctx.createLinearGradient(0, 0, W * 0.6, 0);
    g.addColorStop(0, "rgba(0,0,0,0.6)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
  } else if (side === "rightMid") {
    const g = ctx.createLinearGradient(W, 0, W * 0.4, 0);
    g.addColorStop(0, "rgba(0,0,0,0.6)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
  } else if (side === "bottom") {
    const g = ctx.createLinearGradient(0, H * 0.45, 0, H);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.72)");
    ctx.fillStyle = g;
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.55);
    g.addColorStop(0, "rgba(0,0,0,0.55)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
  }
  ctx.fillRect(0, 0, W, H);

  // Auto-fit: shrink until the title wraps within the style's line budget.
  const sideStacked = side === "leftMid" || side === "rightMid";
  const maxWidth = sideStacked ? W * 0.5 : W * 0.92;
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
  const x = align === "left" ? 64 : align === "right" ? W - 64 : W / 2;
  let y: number;
  if (sideStacked) y = (H - lineHeight * lines.length) / 2 + fontSize * 0.82;
  else if (side === "bottom") y = H - 56 - lineHeight * lines.length + fontSize * 0.82;
  else y = 64 + fontSize * 0.82;

  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;

  for (const line of lines) {
    if (paint.glow) {
      // Neon: coloured glow halo + dark edge + bright inner core.
      ctx.shadowColor = paint.glow;
      ctx.shadowBlur = fontSize * 0.5;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.lineWidth = Math.max(5, fontSize * 0.1);
      ctx.strokeStyle = paint.stroke;
      ctx.strokeText(line, x, y);
      ctx.fillStyle = paint.fill;
      ctx.fillText(line, x, y);
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      if (paint.bright) {
        ctx.fillStyle = paint.bright;
        ctx.fillText(line, x, y);
      }
    } else {
      // Solid fill with a drop shadow, plus an outline when one is set.
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = fontSize * 0.16;
      ctx.shadowOffsetY = fontSize * 0.06;
      if (paint.stroke && paint.stroke !== "transparent") {
        ctx.lineWidth = Math.max(8, fontSize * 0.2);
        ctx.strokeStyle = paint.stroke;
        ctx.strokeText(line, x, y);
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
      }
      ctx.fillStyle = paint.fill;
      ctx.fillText(line, x, y);
    }
    // Reset shadow between lines.
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    y += lineHeight;
  }

  // Layer the cut-out people back on top so the title sits behind their heads.
  // Cover-fit identically to the base (same source frame) so they line up.
  if (foreground) {
    try {
      const fg = await loadImage(foreground);
      const fscale = Math.max(W / fg.width, H / fg.height);
      const fdw = fg.width * fscale;
      const fdh = fg.height * fscale;
      ctx.drawImage(fg, (W - fdw) / 2, (H - fdh) / 2, fdw, fdh);
    } catch {
      /* if the cutout can't be loaded, leave the title on top */
    }
  }

  return canvas.toBuffer("image/jpeg", 0.92);
}
