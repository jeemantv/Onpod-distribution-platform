// Detects the bounding box of a Bannerbear image layer by rendering the
// template with a magenta marker in the slot and scanning the result.
//
// Result is cached in memory per (templateId, slotName) — Bannerbear
// templates are immutable in practice (a new design = a new uid), so
// this cache lives for the process lifetime without invalidation.

import { NextResponse } from "next/server";
import sharp from "sharp";
import { requireSession } from "@/lib/session";
import { generateImage } from "@/lib/bannerbear";

export const maxDuration = 30;

interface SlotDims {
  x: number;
  y: number;
  width: number;
  height: number;
  templateWidth: number;
  templateHeight: number;
}

const cache = new Map<string, SlotDims>();

function markerUrl(req: Request): string {
  // Bannerbear's renderer needs a publicly reachable URL. Use the same
  // origin the client called us on, which works in dev (vercel preview
  // SSO aside) and in prod.
  const origin = new URL(req.url).origin;
  return `${origin}/api/marker.png`;
}

async function detectMagentaBbox(pngBytes: Buffer): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
  imageWidth: number;
  imageHeight: number;
}> {
  const img = sharp(pngBytes);
  const meta = await img.metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (w === 0 || h === 0) throw new Error("could not read rendered image dims");

  // Pull raw pixels. Force 3-channel RGB to keep math simple.
  const raw = await img.removeAlpha().raw().toBuffer();
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;

  // Sample every 4th pixel — close enough for bounding box detection and
  // 16× faster than scanning every pixel.
  const step = 4;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 3;
      const r = raw[i];
      const g = raw[i + 1];
      const b = raw[i + 2];
      // Allow some tolerance — Bannerbear may apply effects/compression
      // that shift the marker color slightly.
      if (r > 200 && g < 80 && b > 200) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) {
    throw new Error("magenta marker not found in rendered image");
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    imageWidth: w,
    imageHeight: h,
  };
}

export async function POST(req: Request) {
  requireSession();
  const body = (await req.json()) as { templateId?: string; slotName?: string };
  const templateId = body.templateId;
  const slotName = body.slotName;
  if (!templateId || !slotName) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const key = `${templateId}:${slotName}`;
  const hit = cache.get(key);
  if (hit) return NextResponse.json({ ...hit, cached: true });

  try {
    const result = await generateImage({
      templateId,
      modifications: [{ name: slotName, image_url: markerUrl(req) }],
    });
    const url = result.image_url_png || result.image_url_jpg || result.image_url;
    if (!url) {
      return NextResponse.json(
        { error: "no_image_url", message: "Bannerbear returned no image url" },
        { status: 500 },
      );
    }
    const fetched = await fetch(url);
    if (!fetched.ok) {
      return NextResponse.json(
        { error: "fetch_failed", message: `Rendered image fetch ${fetched.status}` },
        { status: 500 },
      );
    }
    const bytes = Buffer.from(await fetched.arrayBuffer());
    const bbox = await detectMagentaBbox(bytes);
    const dims: SlotDims = {
      x: bbox.x,
      y: bbox.y,
      width: bbox.width,
      height: bbox.height,
      templateWidth: bbox.imageWidth,
      templateHeight: bbox.imageHeight,
    };
    cache.set(key, dims);
    return NextResponse.json({ ...dims, cached: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[slot-dims] failed", { templateId, slotName, message });
    return NextResponse.json({ error: "slot_dims_failed", message }, { status: 500 });
  }
}
