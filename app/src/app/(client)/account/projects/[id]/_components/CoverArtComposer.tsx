"use client";

import { useEffect, useRef, useState } from "react";

const THUMB_W = 1280;
const THUMB_H = 720;
const RED = "#ff3b30";

type Layout = "lowerBanner" | "topBanner" | "sideBanner" | "cornerTag";

interface Thumbnail {
  label: string;
  url: string;
}

export function CoverArtComposer({
  fileId,
  thumbnails,
  onSaved,
}: {
  fileId: string;
  thumbnails: Thumbnail[];
  onSaved?: (publicUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [baseUrl, setBaseUrl] = useState<string | null>(
    thumbnails[0]?.url ?? null,
  );
  const [baseImage, setBaseImage] = useState<HTMLImageElement | null>(null);
  const [title, setTitle] = useState("EPISODE TITLE");
  const [tag, setTag] = useState("OnPod");
  const [layout, setLayout] = useState<Layout>("lowerBanner");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!baseUrl) {
      setBaseImage(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setBaseImage(img);
    img.onerror = () => setError("Failed to load image. Try a different one.");
    img.src = baseUrl;
  }, [baseUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = THUMB_W;
    canvas.height = THUMB_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Background
    ctx.fillStyle = "#0a0a0b";
    ctx.fillRect(0, 0, THUMB_W, THUMB_H);

    // Base image: cover-fit
    if (baseImage) {
      const scale = Math.max(
        THUMB_W / baseImage.width,
        THUMB_H / baseImage.height,
      );
      const w = baseImage.width * scale;
      const h = baseImage.height * scale;
      ctx.drawImage(baseImage, (THUMB_W - w) / 2, (THUMB_H - h) / 2, w, h);
    }

    // Layout overlays
    ctx.fillStyle = RED;
    if (layout === "lowerBanner") {
      const bh = Math.round(THUMB_H * 0.32);
      ctx.fillRect(0, THUMB_H - bh, THUMB_W, bh);
    } else if (layout === "topBanner") {
      const bh = Math.round(THUMB_H * 0.25);
      ctx.fillRect(0, 0, THUMB_W, bh);
    } else if (layout === "sideBanner") {
      const bw = Math.round(THUMB_W * 0.42);
      ctx.fillRect(0, 0, bw, THUMB_H);
    } else if (layout === "cornerTag") {
      // small slanted corner ribbon at top-left
      ctx.fillRect(0, 0, Math.round(THUMB_W * 0.35), Math.round(THUMB_H * 0.18));
    }

    // Text styles
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "alphabetic";
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 2;

    if (layout === "lowerBanner") {
      ctx.font = "900 100px Poppins, system-ui, sans-serif";
      const lines = wrapText(ctx, title.toUpperCase(), THUMB_W - 96);
      const baseY = THUMB_H - Math.round(THUMB_H * 0.32) + 70;
      lines.slice(0, 2).forEach((line, i) => {
        ctx.fillText(line, 48, baseY + i * 110);
      });
      // tag
      ctx.shadowBlur = 0;
      ctx.font = "700 28px Poppins, system-ui, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillText(tag.toUpperCase(), 48, THUMB_H - Math.round(THUMB_H * 0.32) - 24);
    } else if (layout === "topBanner") {
      ctx.font = "900 88px Poppins, system-ui, sans-serif";
      const lines = wrapText(ctx, title.toUpperCase(), THUMB_W - 96);
      lines.slice(0, 2).forEach((line, i) => {
        ctx.fillText(line, 48, 100 + i * 96);
      });
    } else if (layout === "sideBanner") {
      ctx.font = "900 90px Poppins, system-ui, sans-serif";
      const colWidth = Math.round(THUMB_W * 0.42) - 48;
      const lines = wrapText(ctx, title.toUpperCase(), colWidth);
      const startY = THUMB_H / 2 - (lines.length * 100) / 2 + 80;
      lines.slice(0, 4).forEach((line, i) => {
        ctx.fillText(line, 36, startY + i * 100);
      });
      ctx.shadowBlur = 0;
      ctx.font = "700 24px Poppins, system-ui, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillText(tag.toUpperCase(), 36, 60);
    } else if (layout === "cornerTag") {
      ctx.font = "900 44px Poppins, system-ui, sans-serif";
      ctx.fillText(tag.toUpperCase(), 36, 80);
      // big title at the bottom of full image
      ctx.font = "900 92px Poppins, system-ui, sans-serif";
      ctx.shadowBlur = 12;
      const lines = wrapText(ctx, title.toUpperCase(), THUMB_W - 96);
      const baseY = THUMB_H - 60;
      lines.slice(-2).reverse().forEach((line, i) => {
        ctx.fillText(line, 48, baseY - i * 100);
      });
    }
  }, [baseImage, layout, title, tag]);

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
      const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
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

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[12px] text-text-muted mb-2">Layout</div>
        <div className="grid grid-cols-4 gap-2">
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
          <label className="block text-[12px] text-text-muted mb-1">
            Title (white text)
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input-cv"
          />
        </div>
        <div>
          <label className="block text-[12px] text-text-muted mb-1">
            Tag / show name
          </label>
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            className="input-cv"
          />
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
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleUpload}
          />
        </label>
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
        <a
          download="cover.jpg"
          onClick={(e) => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            (e.currentTarget as HTMLAnchorElement).href = canvas.toDataURL(
              "image/jpeg",
              0.9,
            );
          }}
          className="px-4 py-2 rounded-[8px] bg-bg-elev-3 border border-border-strong text-[13px] cursor-pointer"
        >
          Download JPG
        </a>
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
