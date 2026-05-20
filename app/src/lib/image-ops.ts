// Browser-side image helpers shared by ThumbnailStudio: cropping a
// region of a frame, flipping, and loading images that may have CORS
// quirks.

async function loadImageWithFallback(url: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => {
      fetch(url, { cache: "reload" })
        .then((r) => r.blob())
        .then((b) => {
          const obj = URL.createObjectURL(b);
          const im2 = new Image();
          im2.onload = () => {
            URL.revokeObjectURL(obj);
            resolve(im2);
          };
          im2.onerror = () => {
            URL.revokeObjectURL(obj);
            reject(new Error("image load failed"));
          };
          im2.src = obj;
        })
        .catch(reject);
    };
    img.src = url;
  });
}

/**
 * Crop a region from a base64-encoded JPEG (no `data:` prefix). x/y/width/height
 * are normalized 0..1.
 */
export async function cropBase64Region(
  framesBase64: string,
  region: { x: number; y: number; width: number; height: number },
  padFactor = 0.1,
): Promise<string> {
  const img = await loadImageWithFallback(
    `data:image/jpeg;base64,${framesBase64}`,
  );
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const padX = region.width * padFactor;
  const padY = region.height * padFactor;
  const sx = Math.max(0, Math.round((region.x - padX) * w));
  const sy = Math.max(0, Math.round((region.y - padY) * h));
  const sw = Math.min(w - sx, Math.round((region.width + padX * 2) * w));
  const sh = Math.min(h - sy, Math.round((region.height + padY * 2) * h));
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
  return dataUrl.split(",")[1] ?? "";
}

export async function flipImageHorizontal(url: string): Promise<string> {
  const img = await loadImageWithFallback(url);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(img, 0, 0);
  const dataUrl = canvas.toDataURL("image/png");
  return dataUrl.split(",")[1] ?? "";
}

export async function fileToBase64(file: File): Promise<{ base64: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [meta, b64] = result.split(",");
      const mime = meta.match(/data:([^;]+)/)?.[1] ?? file.type ?? "image/jpeg";
      resolve({ base64: b64, mime });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
