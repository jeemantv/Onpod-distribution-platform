// Serves a solid-magenta 1024×1024 PNG used as a "where does this layer
// land?" marker. Bannerbear fetches this URL when slot-dims asks it to
// render with the marker in a specific image layer; we then detect the
// magenta bounding box in the result to learn the layer's geometry.

import sharp from "sharp";

export const dynamic = "force-static";
export const revalidate = false;

let cached: Buffer | null = null;

export async function GET(): Promise<Response> {
  if (!cached) {
    cached = await sharp({
      create: {
        width: 1024,
        height: 1024,
        channels: 3,
        background: { r: 255, g: 0, b: 255 },
      },
    })
      .png()
      .toBuffer();
  }
  return new Response(new Uint8Array(cached), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
