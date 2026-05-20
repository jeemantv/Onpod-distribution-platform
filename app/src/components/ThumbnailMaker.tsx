"use client";

import { useEffect, useMemo, useState } from "react";
import { extractFrames } from "@/lib/frame-extract";

interface FileRow {
  key: string;
  filename: string;
  fileId: string;
  url: string;
}

interface Pick {
  label: string;
  url: string;
  reason: string;
  key: string;
}

const FRAME_COUNT = 6;

function isVideo(name: string): boolean {
  return /\.(mp4|mov|webm)$/i.test(name);
}

export function ThumbnailMaker({
  files,
  defaultTitle = "",
  defaultSubtitle = "",
}: {
  files: FileRow[];
  defaultTitle?: string;
  defaultSubtitle?: string;
}) {
  const videoFiles = useMemo(
    () => files.filter((f) => isVideo(f.filename)),
    [files],
  );

  const [sourceFileId, setSourceFileId] = useState<string>("");
  const [sourceUrl, setSourceUrl] = useState<string>("");
  const [picks, setPicks] = useState<Pick[]>([]);
  const [activeFrameUrl, setActiveFrameUrl] = useState<string>("");
  const [title, setTitle] = useState(defaultTitle);
  const [subtitle, setSubtitle] = useState(defaultSubtitle);
  const [accent, setAccent] = useState("#ff3b30");
  const [stage, setStage] = useState<"idle" | "extracting" | "picking" | "rendering">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ url: string } | null>(null);
  const [aiSuggested, setAiSuggested] = useState(false);

  useEffect(() => {
    if (videoFiles.length > 0 && !sourceFileId) {
      setSourceFileId(videoFiles[0].fileId);
      setSourceUrl(videoFiles[0].url);
    }
  }, [videoFiles, sourceFileId]);

  // Try to pre-fill title from AI metadata once when source is set
  useEffect(() => {
    if (!sourceFileId || aiSuggested) return;
    void (async () => {
      try {
        const res = await fetch(
          `/api/transcribe/${sourceFileId}/status?include=data`,
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data.ai?.title && !title) setTitle(data.ai.title as string);
        setAiSuggested(true);
      } catch {
        /* ignore */
      }
    })();
  }, [sourceFileId, title, aiSuggested]);

  async function pickFrames() {
    if (!sourceFileId || !sourceUrl) return;
    setError(null);
    setPicks([]);
    setActiveFrameUrl("");
    setStage("extracting");
    try {
      const frames = await extractFrames(sourceUrl, FRAME_COUNT);
      setStage("picking");
      const res = await fetch("/api/ai/thumbnails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: sourceFileId, framesBase64: frames }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || `Pick failed (${res.status})`);
        setStage("idle");
        return;
      }
      const list = data.thumbnails as Pick[];
      setPicks(list);
      if (list[0]) setActiveFrameUrl(list[0].url);
      setStage("idle");
    } catch (err) {
      setError((err as Error).message);
      setStage("idle");
    }
  }

  async function render() {
    if (!sourceFileId || !activeFrameUrl || !title) return;
    setError(null);
    setStage("rendering");
    try {
      const res = await fetch("/api/ai/thumbnail-compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId: sourceFileId,
          frameUrl: activeFrameUrl,
          title,
          subtitle,
          accent,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || `Render failed (${res.status})`);
        setStage("idle");
        return;
      }
      setResult({ url: data.url });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStage("idle");
    }
  }

  if (videoFiles.length === 0) return null;

  return (
    <div className="bg-bg-elev border border-border rounded-[16px] p-4 mb-4">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h2 className="text-[14px] font-semibold">Thumbnail maker</h2>
        <select
          value={sourceFileId}
          onChange={(e) => {
            const fid = e.target.value;
            const row = videoFiles.find((v) => v.fileId === fid);
            setSourceFileId(fid);
            setSourceUrl(row?.url ?? "");
            setPicks([]);
            setActiveFrameUrl("");
            setAiSuggested(false);
          }}
          className="px-3 py-1.5 bg-bg-elev-2 border border-border rounded-[8px] text-[12px]"
        >
          {videoFiles.map((f) => (
            <option key={f.fileId} value={f.fileId}>
              {f.filename}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button
          onClick={pickFrames}
          disabled={stage !== "idle" || !sourceFileId}
          className="px-3 py-2 rounded-[10px] bg-bg-elev-2 border border-border text-[12px] disabled:opacity-50"
        >
          {stage === "extracting"
            ? "Extracting frames…"
            : stage === "picking"
              ? "Vision picking…"
              : "Auto-pick best frames"}
        </button>
        <span className="text-[11px] text-text-dim">
          Pulls {FRAME_COUNT} frames from the video and asks Claude Vision to
          rank them.
        </span>
      </div>

      {picks.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 mb-4">
          {picks.map((p) => (
            <button
              key={p.key}
              onClick={() => setActiveFrameUrl(p.url)}
              className={`relative rounded-[10px] overflow-hidden border-2 transition ${
                activeFrameUrl === p.url
                  ? "border-accent"
                  : "border-border hover:border-border-strong"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={p.label} className="w-full block" />
              <div className="absolute top-1 left-1 px-2 py-0.5 rounded-full bg-black/70 text-white text-[10px] uppercase">
                {p.label}
              </div>
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <label className="text-[11px] text-text-muted">
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Why most founders never escape the grind"
            className="mt-1 w-full px-3 py-2 bg-bg-elev-2 border border-border rounded-[8px] text-[13px]"
          />
        </label>
        <label className="text-[11px] text-text-muted">
          Subtitle
          <input
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="Guest name · OnPod Studios"
            className="mt-1 w-full px-3 py-2 bg-bg-elev-2 border border-border rounded-[8px] text-[13px]"
          />
        </label>
        <label className="text-[11px] text-text-muted">
          Accent color
          <input
            type="color"
            value={accent}
            onChange={(e) => setAccent(e.target.value)}
            className="mt-1 h-9 w-20 bg-bg-elev-2 border border-border rounded-[8px]"
          />
        </label>
      </div>

      <button
        onClick={render}
        disabled={stage !== "idle" || !activeFrameUrl || !title}
        className="px-4 py-2 rounded-[10px] bg-accent text-white text-[13px] disabled:opacity-50"
      >
        {stage === "rendering" ? "Rendering…" : "Render thumbnail"}
      </button>

      {error ? <p className="mt-3 text-[12px] text-danger">{error}</p> : null}

      {result ? (
        <div className="mt-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={result.url}
            alt="Final thumbnail"
            className="rounded-[10px] border border-border max-w-full"
          />
          <p className="text-[11px] text-text-muted mt-1 break-all">
            Saved to: {result.url}
          </p>
        </div>
      ) : null}
    </div>
  );
}
