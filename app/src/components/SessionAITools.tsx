"use client";

import { useEffect, useState } from "react";

interface FileRow {
  key: string;
  filename: string;
  fileId: string;
}

type Status = "idle" | "transcribing" | "generating" | "ready" | "error";

function isVideo(name: string): boolean {
  return /\.(mp4|mov|webm|m4a|mp3|wav|flac)$/i.test(name);
}

export function SessionAITools({
  files,
}: {
  files: FileRow[];
}) {
  const videoFiles = files.filter((f) => isVideo(f.filename));
  if (videoFiles.length === 0) return null;

  return (
    <div className="bg-bg-elev border border-border rounded-[16px] p-4 mb-4">
      <h2 className="text-[14px] font-semibold mb-2">AI tools</h2>
      <p className="text-[12px] text-text-muted mb-4">
        Transcribe with Deepgram, then generate titles/descriptions/articles with Claude.
      </p>
      <ul className="space-y-2">
        {videoFiles.map((f) => (
          <FileAIRow key={f.key} file={f} />
        ))}
      </ul>
    </div>
  );
}

function FileAIRow({ file }: { file: FileRow }) {
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function tick() {
      try {
        const res = await fetch(`/api/transcribe/${file.fileId}/status`);
        const data = await res.json();
        if (!mounted) return;
        setStatus(data.status);
        setProgress(data.progress ?? 0);
        if (data.status === "ready" || data.status === "error") {
          if (timer) clearInterval(timer);
        }
      } catch {
        // ignore polling errors
      }
    }
    void tick();
    timer = setInterval(tick, 5000);
    return () => {
      mounted = false;
      if (timer) clearInterval(timer);
    };
  }, [file.fileId]);

  async function start() {
    setError(null);
    setStatus("transcribing");
    try {
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: file.fileId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || `Transcribe failed (${res.status})`);
        setStatus("error");
      }
    } catch (err) {
      setError((err as Error).message);
      setStatus("error");
    }
  }

  const label =
    status === "ready"
      ? "Ready ✓"
      : status === "transcribing"
        ? `Transcribing… ${progress}%`
        : status === "generating"
          ? `Generating metadata… ${progress}%`
          : status === "error"
            ? "Error"
            : "Start";

  return (
    <li className="flex items-center justify-between gap-3 bg-bg-elev-2 border border-border rounded-[10px] px-3 py-2">
      <span className="font-mono text-[12px] truncate">{file.filename}</span>
      <div className="flex items-center gap-2 shrink-0">
        {error ? <span className="text-[11px] text-danger">{error}</span> : null}
        <button
          onClick={start}
          disabled={status === "transcribing" || status === "generating" || status === "ready"}
          className="px-3 py-1.5 rounded-[8px] bg-accent text-white text-[12px] disabled:opacity-50"
        >
          {label}
        </button>
      </div>
    </li>
  );
}
