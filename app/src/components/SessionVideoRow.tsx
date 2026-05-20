"use client";

// One row per video file. Shows a quick poster (first-frame snapshot
// rendered from the public URL with <video preload="metadata">) plus
// inline quick-action buttons that scroll/focus the matching tool
// panel above.

import { useEffect, useRef, useState } from "react";

interface FileRow {
  key: string;
  filename: string;
  fileId: string;
  url: string;
  sizeBytes: number;
  lastModified: string | null;
}

function isVideo(name: string): boolean {
  return /\.(mp4|mov|webm)$/i.test(name);
}

function fmt(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

type AIStatus = "idle" | "transcribing" | "generating" | "ready" | "error";

export function SessionVideoRow({
  file,
  onSelect,
  canTrash,
  onTrash,
}: {
  file: FileRow;
  onSelect: (target: "ai" | "thumb" | "opus" | "podcast", fileId: string) => void;
  canTrash: boolean;
  onTrash?: (filename: string) => void;
}) {
  const [aiStatus, setAiStatus] = useState<AIStatus>("idle");
  const [duration, setDuration] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/transcribe/${file.fileId}/status`);
        const data = await res.json();
        if (cancelled) return;
        setAiStatus(data.status);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file.fileId]);

  function onLoadedMetadata() {
    const v = videoRef.current;
    if (v && isFinite(v.duration) && v.duration > 0) {
      setDuration(v.duration);
    }
  }

  if (!isVideo(file.filename)) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-bg-elev border border-border rounded-lg">
        <div className="w-10 h-10 rounded-md bg-bg-elev-3 flex items-center justify-center text-text-muted shrink-0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-[13px] truncate font-mono">{file.filename}</div>
          <p className="text-[11px] text-text-muted mt-0.5">{fmt(file.sizeBytes)}</p>
        </div>
        <a
          href={file.url}
          target="_blank"
          rel="noreferrer"
          className="px-3 py-1.5 rounded-[8px] bg-accent text-white text-[12px]"
        >
          Download
        </a>
      </div>
    );
  }

  return (
    <div className="bg-bg-elev border border-border rounded-lg p-3 hover:border-border-strong transition">
      <div className="flex gap-3 items-start flex-wrap sm:flex-nowrap">
        {/* Poster */}
        <video
          ref={videoRef}
          src={file.url}
          preload="metadata"
          muted
          playsInline
          onLoadedMetadata={onLoadedMetadata}
          className="w-full sm:w-48 aspect-video rounded-md bg-bg-elev-3 object-cover shrink-0"
        />

        <div className="flex-1 min-w-0">
          <div className="font-medium text-[13px] sm:text-[14px] truncate font-mono">
            {file.filename}
          </div>
          <p className="text-[11px] sm:text-[12px] text-text-muted mt-1">
            {fmt(file.sizeBytes)}
            {duration ? <> · {Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, "0")}</> : null}
            {file.lastModified ? <> · {new Date(file.lastModified).toLocaleDateString()}</> : null}
          </p>

          {/* Status pills */}
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            <Pill
              label={
                aiStatus === "ready"
                  ? "AI ready"
                  : aiStatus === "transcribing"
                    ? "Transcribing…"
                    : aiStatus === "generating"
                      ? "Generating…"
                      : aiStatus === "error"
                        ? "AI error"
                        : "Not transcribed"
              }
              tone={
                aiStatus === "ready"
                  ? "success"
                  : aiStatus === "error"
                    ? "danger"
                    : aiStatus === "idle"
                      ? "muted"
                      : "accent"
              }
            />
          </div>

          {/* Action buttons */}
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <ActionButton onClick={() => onSelect("ai", file.fileId)} icon="🧠" label="AI" />
            <ActionButton onClick={() => onSelect("thumb", file.fileId)} icon="🖼" label="Thumb" />
            <ActionButton onClick={() => onSelect("opus", file.fileId)} icon="✂️" label="Clips" />
            <ActionButton onClick={() => onSelect("podcast", file.fileId)} icon="🎙" label="Podcast" />
            <a
              href={file.url}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 rounded-[8px] bg-accent text-white text-[12px]"
            >
              ⬇︎ Download
            </a>
            {canTrash && onTrash ? (
              <button
                onClick={() => onTrash(file.filename)}
                className="px-3 py-1.5 rounded-[8px] bg-bg-elev-3 border border-border text-[12px] hover:border-border-strong"
              >
                Trash
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  onClick,
  icon,
  label,
}: {
  onClick: () => void;
  icon: string;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-[8px] bg-bg-elev-2 border border-border hover:border-border-strong text-[12px] flex items-center gap-1.5"
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function Pill({
  label,
  tone,
}: {
  label: string;
  tone: "success" | "danger" | "accent" | "muted";
}) {
  const styles: Record<string, string> = {
    success: "bg-[rgba(20,184,166,0.12)] text-accent-2",
    danger: "bg-[rgba(239,68,68,0.12)] text-danger",
    accent: "bg-[rgba(255,59,48,0.12)] text-accent",
    muted: "bg-bg-elev-3 text-text-muted",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider ${styles[tone]}`}>
      {label}
    </span>
  );
}
