"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

const THUMB_W = 1280;
const THUMB_H = 720;

type Layout = "lowerBanner" | "topBanner" | "sideBanner" | "cornerTag";

interface Thumbnail {
  label: string;
  url: string;
}

export function CoverArtComposer({
  fileId,
  thumbnails,
  defaultTitle,
  defaultTag,
  existingCoverUrl,
  onSaved,
}: {
  fileId: string;
  thumbnails: Thumbnail[];
  defaultTitle?: string;
  defaultTag?: string;
  existingCoverUrl?: string | null;
  onSaved?: (publicUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [baseUrl, setBaseUrl] = useState<string | null>(
    thumbnails[0]?.url ?? null,
  );

  // If thumbnails arrive after mount (async restore from B2), auto-pick first
  useEffect(() => {
    if (!baseUrl && thumbnails[0]?.url) setBaseUrl(thumbnails[0].url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thumbnails]);

  const [baseImage, setBaseImage] = useState<HTMLImageElement | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [title, setTitle] = useState(defaultTitle ?? "EPISODE TITLE");
  const [tag, setTag] = useState(defaultTag ?? "OnPod");
  const [layout, setLayout] = useState<Layout>("lowerBanner");
  const [bannerColor, setBannerColor] = useState("#ff3b30");
  const [textColor, setTextColor] = useState("#ffffff");
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0); // -1..1 (-1 = leftmost, 1 = rightmost)
  const [panY, setPanY] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(existingCoverUrl ?? null);
  const [error, setError] = useState<string | null>(null);
  const [enhancing, setEnhancing] = useState(false);
  const [enhanceError, setEnhanceError] = useState<string | null>(null);

  const enhanceBase = async () => {
    if (!baseImage) return;
    setEnhancing(true);
    setEnhanceError(null);
    try {
      // Render the *cropped + zoomed* base image (no banner/text overlay)
      // to an offscreen canvas, then send THAT to Gemini. This way the
      // enhancement matches what the user composed.
      const off = document.createElement("canvas");
      off.width = THUMB_W;
      off.height = THUMB_H;
      const ctx = off.getContext("2d");
      if (!ctx) throw new Error("no offscreen ctx");
      ctx.fillStyle = "#0a0a0b";
      ctx.fillRect(0, 0, THUMB_W, THUMB_H);
      const baseScale = Math.max(
        THUMB_W / baseImage.width,
        THUMB_H / baseImage.height,
      );
      const scale = baseScale * zoom;
      const w = baseImage.width * scale;
      const h = baseImage.height * scale;
      const overflowX = Math.max(0, w - THUMB_W);
      const overflowY = Math.max(0, h - THUMB_H);
      const x = (THUMB_W - w) / 2 + (panX * overflowX) / 2;
      const y = (THUMB_H - h) / 2 + (panY * overflowY) / 2;
      ctx.drawImage(baseImage, x, y, w, h);

      const dataUrl = off.toDataURL("image/jpeg", 0.92);
      const b64 = dataUrl.split(",")[1] ?? "";

      const res = await fetch("/api/ai/enhance-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId, imageBase64: b64 }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
      }
      const body = (await res.json()) as { url: string };
      // Swap in the enhanced version as the new base. Reset zoom/pan since
      // it's already cropped/composed.
      setBaseUrl(body.url);
      setZoom(1);
      setPanX(0);
      setPanY(0);
    } catch (err) {
      setEnhanceError((err as Error).message);
    } finally {
      setEnhancing(false);
    }
  };

  // Defer expensive props so the title/tag inputs stay responsive
  const deferredTitle = useDeferredValue(title);
  const deferredTag = useDeferredValue(tag);
  const deferredBannerColor = useDeferredValue(bannerColor);
  const deferredTextColor = useDeferredValue(textColor);
  const deferredLayout = useDeferredValue(layout);
  const deferredZoom = useDeferredValue(zoom);
  const deferredPanX = useDeferredValue(panX);
  const deferredPanY = useDeferredValue(panY);

  // Sync defaults when they arrive late (e.g. after AI loads)
  useEffect(() => {
    if (defaultTitle && title === "EPISODE TITLE") setTitle(defaultTitle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultTitle]);

  // Load base image. Try direct crossOrigin first; if it fails (CORS, network),
  // fall back to fetch+blob+objectURL. Either path yields an untainted canvas.
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setImageError(null);
    if (!baseUrl) {
      setBaseImage(null);
      return;
    }

    const tryDirect = (): Promise<HTMLImageElement> =>
      new Promise((resolve, reject) => {
        const img = new Image();
        if (baseUrl.startsWith("http")) img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("direct load failed"));
        img.src = baseUrl;
      });

    const tryBlobFallback = async (): Promise<HTMLImageElement> => {
      // cache: 'reload' forces the browser to revalidate / refetch, bypassing
      // any stale no-CORS response that's currently cached for this URL.
      const res = await fetch(baseUrl, { mode: "cors", cache: "reload" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      objectUrl = URL.createObjectURL(blob);
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("blob load failed"));
        img.src = objectUrl!;
      });
    };

    (async () => {
      try {
        const img = await tryDirect().catch(async () => tryBlobFallback());
        if (!cancelled) setBaseImage(img);
      } catch (err) {
        if (!cancelled)
          setImageError(`Couldn't load image: ${(err as Error).message}`);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [baseUrl]);

  // Canvas render — heavy, runs on deferred values so typing stays smooth
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = THUMB_W;
    canvas.height = THUMB_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#0a0a0b";
    ctx.fillRect(0, 0, THUMB_W, THUMB_H);

    if (baseImage) {
      const baseScale = Math.max(
        THUMB_W / baseImage.width,
        THUMB_H / baseImage.height,
      );
      const scale = baseScale * deferredZoom;
      const w = baseImage.width * scale;
      const h = baseImage.height * scale;
      // pan range: amount of overflow * pan ratio
      const overflowX = Math.max(0, w - THUMB_W);
      const overflowY = Math.max(0, h - THUMB_H);
      const x = (THUMB_W - w) / 2 + (deferredPanX * overflowX) / 2;
      const y = (THUMB_H - h) / 2 + (deferredPanY * overflowY) / 2;
      ctx.drawImage(baseImage, x, y, w, h);
    }

    drawOverlay(ctx, deferredLayout, deferredTitle, deferredTag, {
      banner: deferredBannerColor,
      text: deferredTextColor,
    });
  }, [
    baseImage,
    deferredLayout,
    deferredTitle,
    deferredTag,
    deferredBannerColor,
    deferredTextColor,
    deferredZoom,
    deferredPanX,
    deferredPanY,
  ]);

  // Drag-to-pan: listeners bound once. Refs hold transient drag state +
  // latest pan values so state updates don't tear the drag.
  const panRef = useRef({ x: panX, y: panY });
  useEffect(() => {
    panRef.current.x = panX;
    panRef.current.y = panY;
  }, [panX, panY]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const drag = {
      active: false,
      startClientX: 0,
      startClientY: 0,
      startPanX: 0,
      startPanY: 0,
    };

    const onDown = (e: PointerEvent) => {
      drag.active = true;
      drag.startClientX = e.clientX;
      drag.startClientY = e.clientY;
      drag.startPanX = panRef.current.x;
      drag.startPanY = panRef.current.y;
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = "grabbing";
    };
    const onMove = (e: PointerEvent) => {
      if (!drag.active) return;
      const rect = canvas.getBoundingClientRect();
      const dx = (e.clientX - drag.startClientX) / rect.width;
      const dy = (e.clientY - drag.startClientY) / rect.height;
      setPanX(clamp(drag.startPanX - dx * 2, -1, 1));
      setPanY(clamp(drag.startPanY - dy * 2, -1, 1));
    };
    const onUp = (e: PointerEvent) => {
      drag.active = false;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        // ignore — pointer may already be released
      }
      canvas.style.cursor = "grab";
    };

    canvas.style.cursor = "grab";
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setBaseUrl(reader.result as string);
    reader.readAsDataURL(f);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("no canvas");
      const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
      const b64 = dataUrl.split(",")[1] ?? "";
      const res = await fetch("/api/ai/cover-art", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId, imageBase64: b64 }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
      }
      const body = (await res.json()) as { url: string };
      setSaved(body.url);
      onSaved?.(body.url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const downloadLocal = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "cover.jpg";
    a.click();
  };

  const presets = useMemo(
    () => [
      { banner: "#ff3b30", text: "#ffffff", label: "OnPod red" },
      { banner: "#0a0a0b", text: "#ffffff", label: "Black" },
      { banner: "#a855f7", text: "#ffffff", label: "Purple" },
      { banner: "#10b981", text: "#0a0a0b", label: "Green" },
      { banner: "#fbbf24", text: "#0a0a0b", label: "Yellow" },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[12px] text-text-muted mb-2">Layout</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { v: "lowerBanner", label: "Lower banner" },
            { v: "topBanner", label: "Top banner" },
            { v: "sideBanner", label: "Side panel" },
            { v: "cornerTag", label: "Corner tag" },
          ].map((l) => (
            <button
              key={l.v}
              onClick={() => setLayout(l.v as Layout)}
              className={`px-2 py-2 rounded-[8px] border text-[11px] sm:text-[12px] transition ${
                layout === l.v
                  ? "bg-bg-elev-3 border-border-strong text-text"
                  : "bg-bg-elev-2 border-border text-text-muted hover:text-text"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[12px] text-text-muted mb-1">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input-cv"
          />
        </div>
        <div>
          <label className="block text-[12px] text-text-muted mb-1">Tag / show name</label>
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            className="input-cv"
          />
        </div>
      </div>

      <div>
        <div className="text-[12px] text-text-muted mb-2">Colors</div>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-[12px]">
            Banner
            <input
              type="color"
              value={bannerColor}
              onChange={(e) => setBannerColor(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer border border-border"
            />
          </label>
          <label className="flex items-center gap-2 text-[12px]">
            Text
            <input
              type="color"
              value={textColor}
              onChange={(e) => setTextColor(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer border border-border"
            />
          </label>
          <div className="flex items-center gap-1.5 ml-auto flex-wrap">
            {presets.map((p) => (
              <button
                key={p.label}
                onClick={() => {
                  setBannerColor(p.banner);
                  setTextColor(p.text);
                }}
                title={p.label}
                className="w-7 h-7 rounded-full border border-border-strong"
                style={{ background: p.banner }}
              />
            ))}
          </div>
        </div>
      </div>

      <div>
        <div className="text-[12px] text-text-muted mb-2">Base photo</div>
        <div className="grid grid-cols-3 gap-2 mb-2">
          {thumbnails.map((t) => (
            <button
              key={t.label}
              onClick={() => setBaseUrl(t.url)}
              className={`aspect-video rounded-[8px] overflow-hidden border-2 ${
                baseUrl === t.url ? "border-accent" : "border-border"
              }`}
            >
              <img src={t.url} alt={t.label} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
        <label className="inline-block px-3 py-2 rounded-[8px] bg-bg-elev-2 border border-border hover:border-border-strong text-[12px] cursor-pointer">
          Upload custom photo
          <input type="file" accept="image/*" className="hidden" onChange={handleUpload} />
        </label>
        {imageError ? (
          <p className="mt-2 text-[11px] text-[#f87171]">{imageError}</p>
        ) : null}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[12px] text-text-muted">
            Preview (1280×720) — drag to pan
          </div>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPanX(0);
              setPanY(0);
            }}
            className="text-[11px] text-text-muted hover:text-text"
          >
            Reset
          </button>
        </div>
        <canvas
          ref={canvasRef}
          className="w-full rounded-lg border border-border-strong touch-none select-none"
          style={{ aspectRatio: "16/9" }}
        />
        <div className="flex items-center gap-3 mt-2 text-[11px] text-text-muted">
          <span className="w-12 shrink-0">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="flex-1 accent-accent"
          />
          <span className="w-12 text-right tabular-nums">
            {zoom.toFixed(2)}×
          </span>
        </div>

        <div className="mt-4 flex items-start gap-3 flex-wrap">
          <button
            type="button"
            onClick={enhanceBase}
            disabled={enhancing || !baseImage}
            className="px-4 py-2 rounded-[8px] bg-[linear-gradient(135deg,#a855f7,#ec4899)] text-white text-[13px] font-medium disabled:opacity-60"
          >
            {enhancing ? "Enhancing…" : "✨ Enhance with AI"}
          </button>
          <p className="text-[11px] text-text-muted flex-1 min-w-[200px]">
            Click after you finish zooming and panning. Gemini will rebuild the cropped frame with sharper detail, then reset zoom/pan so you can work with the enhanced version.
          </p>
        </div>
        {enhanceError ? (
          <p className="mt-2 text-[11px] text-[#f87171]">{enhanceError}</p>
        ) : null}
      </div>

      {error ? (
        <div className="p-3 rounded-[10px] bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-[12px] text-[#f87171]">
          {error}
        </div>
      ) : null}

      {saved ? (
        <div className="p-3 rounded-[10px] bg-[rgba(16,185,129,0.1)] border border-[rgba(16,185,129,0.3)] text-[12px] text-[#34d399]">
          Saved. Will be used as the YouTube thumbnail next time you publish.{" "}
          <a href={saved} target="_blank" rel="noreferrer" className="underline">
            Open
          </a>
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          onClick={save}
          disabled={saving || !baseImage}
          className="px-4 py-2 rounded-[8px] bg-accent text-white text-[13px] font-medium disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save as cover art"}
        </button>
        <button
          type="button"
          onClick={downloadLocal}
          className="px-4 py-2 rounded-[8px] bg-bg-elev-3 border border-border-strong text-[13px]"
        >
          Download JPG
        </button>
      </div>

      <style jsx>{`
        :global(.input-cv) {
          width: 100%;
          padding: 10px 14px;
          background: #1c1c20;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          color: #fafafa;
          font-family: inherit;
          font-size: 13px;
        }
      `}</style>
    </div>
  );
}

interface ColorPair {
  banner: string;
  text: string;
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  layout: Layout,
  title: string,
  tag: string,
  colors: ColorPair,
) {
  ctx.fillStyle = colors.banner;
  let bannerRect = { x: 0, y: 0, w: 0, h: 0 };

  if (layout === "lowerBanner") {
    bannerRect = { x: 0, y: Math.round(THUMB_H * 0.66), w: THUMB_W, h: Math.round(THUMB_H * 0.34) };
  } else if (layout === "topBanner") {
    bannerRect = { x: 0, y: 0, w: THUMB_W, h: Math.round(THUMB_H * 0.28) };
  } else if (layout === "sideBanner") {
    bannerRect = { x: 0, y: 0, w: Math.round(THUMB_W * 0.45), h: THUMB_H };
  } else if (layout === "cornerTag") {
    bannerRect = { x: 0, y: 0, w: Math.round(THUMB_W * 0.38), h: Math.round(THUMB_H * 0.22) };
  }
  ctx.fillRect(bannerRect.x, bannerRect.y, bannerRect.w, bannerRect.h);

  ctx.fillStyle = colors.text;
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 3;
  ctx.textBaseline = "middle";

  if (layout === "lowerBanner") {
    const padX = 64;
    const padY = 36;
    const usableH = bannerRect.h - padY * 2;
    const maxLines = 2;
    const fitted = fitText(
      ctx,
      title.toUpperCase(),
      bannerRect.w - padX * 2,
      usableH,
      maxLines,
      120,
      "900",
    );
    const totalH = fitted.lines.length * fitted.lineHeight;
    const startY = bannerRect.y + bannerRect.h / 2 - totalH / 2 + fitted.lineHeight / 2;
    fitted.lines.forEach((line, i) => {
      ctx.fillText(line, bannerRect.x + padX, startY + i * fitted.lineHeight);
    });
    if (tag) {
      ctx.shadowBlur = 0;
      ctx.font = "700 28px Poppins, system-ui, sans-serif";
      ctx.globalAlpha = 0.85;
      ctx.fillText(
        tag.toUpperCase(),
        bannerRect.x + padX,
        bannerRect.y - 36,
      );
      ctx.globalAlpha = 1;
    }
  } else if (layout === "topBanner") {
    const padX = 64;
    const usableH = bannerRect.h - 36 * 2;
    const fitted = fitText(
      ctx,
      title.toUpperCase(),
      bannerRect.w - padX * 2,
      usableH,
      2,
      110,
      "900",
    );
    const totalH = fitted.lines.length * fitted.lineHeight;
    const startY = bannerRect.y + bannerRect.h / 2 - totalH / 2 + fitted.lineHeight / 2;
    fitted.lines.forEach((line, i) => {
      ctx.fillText(line, bannerRect.x + padX, startY + i * fitted.lineHeight);
    });
  } else if (layout === "sideBanner") {
    const padX = 40;
    const padY = 80;
    const fitted = fitText(
      ctx,
      title.toUpperCase(),
      bannerRect.w - padX * 2,
      bannerRect.h - padY * 2,
      6,
      110,
      "900",
    );
    const totalH = fitted.lines.length * fitted.lineHeight;
    const startY = bannerRect.h / 2 - totalH / 2 + fitted.lineHeight / 2;
    fitted.lines.forEach((line, i) => {
      ctx.fillText(line, padX, startY + i * fitted.lineHeight);
    });
    if (tag) {
      ctx.shadowBlur = 0;
      ctx.font = "700 26px Poppins, system-ui, sans-serif";
      ctx.globalAlpha = 0.85;
      ctx.fillText(tag.toUpperCase(), padX, padY / 2 + 8);
      ctx.globalAlpha = 1;
    }
  } else if (layout === "cornerTag") {
    ctx.textBaseline = "middle";
    ctx.font = "900 48px Poppins, system-ui, sans-serif";
    ctx.fillText(tag.toUpperCase(), 36, bannerRect.h / 2);
    // big title at the bottom of full image, no background
    ctx.shadowColor = "rgba(0,0,0,0.7)";
    ctx.shadowBlur = 14;
    ctx.textBaseline = "alphabetic";
    const padX = 48;
    const fitted = fitText(
      ctx,
      title.toUpperCase(),
      THUMB_W - padX * 2,
      Math.round(THUMB_H * 0.45),
      3,
      100,
      "900",
    );
    const totalH = fitted.lines.length * fitted.lineHeight;
    const baseY = THUMB_H - 48 - (fitted.lines.length - 1) * fitted.lineHeight;
    fitted.lines.forEach((line, i) => {
      ctx.fillText(line, padX, baseY + i * fitted.lineHeight - (totalH - fitted.lineHeight));
    });
  }

  // Reset shadow / alpha
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.globalAlpha = 1;
}

interface FittedText {
  lines: string[];
  fontSize: number;
  lineHeight: number;
}

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxHeight: number,
  maxLines: number,
  startFontSize: number,
  weight: string,
): FittedText {
  // Shrink font size until it fits in maxLines lines AND vertical maxHeight.
  let size = startFontSize;
  while (size >= 28) {
    ctx.font = `${weight} ${size}px Poppins, system-ui, sans-serif`;
    const wrapped = wrapText(ctx, text, maxWidth);
    const lh = Math.round(size * 1.05);
    if (wrapped.length <= maxLines && wrapped.length * lh <= maxHeight) {
      return { lines: wrapped, fontSize: size, lineHeight: lh };
    }
    size -= 6;
  }
  // Fallback: just truncate
  ctx.font = `${weight} 28px Poppins, system-ui, sans-serif`;
  const wrapped = wrapText(ctx, text, maxWidth).slice(0, maxLines);
  return { lines: wrapped, fontSize: 28, lineHeight: 30 };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const next = current ? `${current} ${w}` : w;
    if (ctx.measureText(next).width > maxWidth && current) {
      lines.push(current);
      current = w;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}
