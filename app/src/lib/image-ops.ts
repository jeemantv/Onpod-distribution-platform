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

export async function flipImageHorizontal(
  url: string,
  options: { keepAlpha?: boolean; maxDim?: number; quality?: number } = {},
): Promise<{ base64: string; mime: string }> {
  const { keepAlpha = true, maxDim = 1800, quality = 0.92 } = options;
  const img = await loadImageWithFallback(url);
  // Constrain to maxDim so the resulting base64 fits Vercel's body limit.
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  if (!keepAlpha) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
  }
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(img, 0, 0, w, h);
  const mime = keepAlpha ? "image/png" : "image/jpeg";
  const dataUrl =
    mime === "image/png" ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", quality);
  return { base64: dataUrl.split(",")[1] ?? "", mime };
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

/**
 * Shrink an image client-side before upload so it fits Vercel's ~4.5 MB
 * serverless body limit. Always re-encodes as JPEG (no alpha) so PNGs
 * with photographic content don't blow up the payload. If decode fails
 * (HEIC/AVIF/anything the browser can't paint to canvas), throws with a
 * readable message rather than uploading a raw multi-MB blob.
 */
export async function shrinkImageForUpload(
  file: File,
  maxDim = 1800,
  quality = 0.82,
): Promise<{ base64: string; mime: string }> {
  // Try canvas-decoding everything that says "image/*". Anything else
  // (PDF etc) — refuse upfront.
  if (!file.type.startsWith("image/")) {
    throw new Error(`Unsupported file type: ${file.type || "unknown"}`);
  }

  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

  const img: HTMLImageElement = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () =>
      reject(
        new Error(
          "Browser can't decode this image format (HEIC/AVIF?). Export as JPEG or PNG first.",
        ),
      );
    i.src = dataUrl;
  });

  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Browser denied 2d canvas — try a different browser.");
  // Flatten onto a white background so JPEG re-encoding of transparent
  // PNGs doesn't produce a black halo behind cutouts.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  // Always JPEG — smaller than PNG for photos and the upload route stores
  // raw bytes either way. Transparency, if needed, is reintroduced by the
  // server-side bg-removal step.
  const outUrl = canvas.toDataURL("image/jpeg", quality);
  const b64 = outUrl.split(",")[1] ?? "";

  // Final sanity check — base64 inflates 33% but the JSON body has
  // additional overhead. Refuse upfront so the user sees a real message
  // rather than the cryptic Vercel HTML error page.
  const approxBytes = Math.round((b64.length * 3) / 4);
  if (approxBytes > 4_000_000) {
    throw new Error(
      `Image is still ${(approxBytes / 1024 / 1024).toFixed(1)} MB after compression — try a smaller / lower-resolution source.`,
    );
  }

  return { base64: b64, mime: "image/jpeg" };
}
