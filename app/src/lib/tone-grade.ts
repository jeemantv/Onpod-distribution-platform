// Server-side tone curve for thumbnail outputs. Applied after the
// neural upscaler so the result has the punchy "video-graphics" look
// the user asked for: lower blacks, lifted whites, slight saturation
// boost. Equivalent to a gentle S-curve on the luma channel.

import sharp from "sharp";

export interface GradeOptions {
  // Multiply pixel values (1.0 = identity, >1 brighter, <1 darker).
  // sharp's `linear` does y = a*x + b on each channel — use a slight a>1
  // and a negative b to crush blacks and lift whites.
  brightnessSlope?: number;
  blackOffset?: number;
  saturationBoost?: number;
  gamma?: number;
}

const DEFAULTS: Required<GradeOptions> = {
  brightnessSlope: 1.12, // 12% brighter slope across the curve
  blackOffset: -10,      // shift blacks ~10/255 lower
  saturationBoost: 1.12, // 12% more saturated
  gamma: 0.95,           // slight gamma lift in midtones
};

export async function applyToneGrade(
  inputBuffer: Buffer,
  options?: GradeOptions,
): Promise<{ buf: Buffer; mime: string }> {
  const opts = { ...DEFAULTS, ...(options ?? {}) };
  const image = sharp(inputBuffer);
  const meta = await image.metadata();
  const isPng = meta.format === "png" || meta.hasAlpha;
  // Compose: gamma lift → linear (slope/intercept) crush blacks + lift
  // whites → saturation modulate.
  const out = await image
    .gamma(opts.gamma * 2 + 0.01) // sharp's gamma is inverse — translate from "lift" semantics
    .linear(opts.brightnessSlope, opts.blackOffset)
    .modulate({ saturation: opts.saturationBoost })
    .toFormat(isPng ? "png" : "jpeg", isPng ? { compressionLevel: 6 } : { quality: 92 })
    .toBuffer();
  return { buf: out, mime: isPng ? "image/png" : "image/jpeg" };
}
