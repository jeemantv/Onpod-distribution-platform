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
  const [baseImage, setBaseImage] = useState<HTMLImageElement | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [title, setTitle] = useState(defaultTitle ?? "EPISODE TITLE");
  const [tag, setTag] = useState(defaultTag ?? "OnPod");
  const [layout, setLayout] = useState<Layout>("lowerBanner");
  const [bannerColor, setBannerColor] = useState("#ff3b30");
  const [textColor, setTextColor] = useState("#ffffff");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(existingCoverUrl ?? null);
  const [error, setError] = useState<string | null>(null);

  // Defer expensive props so the title/tag inputs stay responsive
  const deferredTitle = useDeferredValue(title);
  const deferredTag = useDeferredValue(tag);
  const deferredBannerColor = useDeferredValue(bannerColor);
  const deferredTextColor = useDeferredValue(textColor);
  const deferredLayout = useDeferredValue(layout);

  // Sync defaults when they arrive late (e.g. after AI loads)
  useEffect(() => {
    if (defaultTitle && title === "EPISODE TITLE") setTitle(defaultTitle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultTitle]);

  // Load base image via fetch → blob → object URL.
  // This avoids canvas taint from cross-origin loads — we can read pixels and toDataURL works.
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setImageError(null);
    if (!baseUrl) {
      setBaseImage(null);
      return;
    }
    (async () => {
      try {
        let src = baseUrl;
        if (baseUrl.startsWith("http")) {
          const res = await fetch(baseUrl);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          objectUrl = URL.createObjectURL(blob);
          src = objectUrl;
        }
        const img = new Image();
        img.onload = () => {
          if (!cancelled) setBaseImage(img);
        };
        img.onerror = () => {
          if (!cancelled) setImageError("Image decode failed.");
        };
        img.src = src;
      } catch (err) {
        if (!cancelled)
          setImageError(`Couldn't fetch: ${(err as Error).message}`);
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
      const scale = Math.max(
        THUMB_W / baseImage.width,
        THUMB_H / baseImage.height,
      );
      const w = baseImage.width * scale;
      const h = baseImage.height * scale;
      ctx.drawImage(baseImage, (THUMB_W - w) / 2, (THUMB_H - h) / 2, w, h);
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
  ]);

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
        <div className="text-[12px] text-text-muted mb-2">Preview (1280×720)</div>
        <canvas
          ref={canvasRef}
          className="w-full rounded-lg border border-border-strong"
          style={{ aspectRatio: "16/9" }}
        />
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
