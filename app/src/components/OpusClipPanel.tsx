"use client";

import { useEffect, useMemo, useState } from "react";

interface FileRow {
  key: string;
  filename: string;
  fileId: string;
}

function isVideo(name: string): boolean {
  return /\.(mp4|mov|webm)$/i.test(name);
}

type JobState = {
  jobId: string;
  status: string;
  clipsDelivered?: number;
  clipsRemote?: number;
  fetchError?: string;
};

export function OpusClipPanel({ files }: { files: FileRow[] }) {
  const videoFiles = useMemo(
    () => files.filter((f) => isVideo(f.filename)),
    [files],
  );
  const [activeFileId, setActiveFileId] = useState<string>("");
  const [duration, setDuration] = useState<string>("0-89");
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<JobState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (videoFiles.length > 0 && !activeFileId) {
      setActiveFileId(videoFiles[0].fileId);
    }
  }, [videoFiles, activeFileId]);

  useEffect(() => {
    if (!job) return;
    if (job.status === "succeeded" || job.status === "failed") return;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/opus/status?jobId=${job.jobId}`);
        if (!res.ok) return;
        const data = await res.json();
        setJob({ ...data, jobId: job.jobId });
      } catch {
        /* ignore */
      }
    }, 8000);
    return () => clearInterval(id);
  }, [job]);

  if (videoFiles.length === 0) return null;

  async function start() {
    if (!activeFileId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/opus/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId: activeFileId,
          durationRange: duration,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || `Start failed (${res.status})`);
        setBusy(false);
        return;
      }
      setJob({ jobId: data.jobId, status: data.status ?? "queued" });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-bg-elev border border-border rounded-[16px] p-4 mb-4">
      <h2 className="text-[14px] font-semibold mb-2">OpusClip</h2>
      <p className="text-[12px] text-text-muted mb-3">
        Send a video file to OpusClip. Clips land in B2 next to the source under
        <code className="text-accent-2 ml-1">clips/</code>.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <label className="text-[11px] text-text-muted">
          Source file
          <select
            value={activeFileId}
            onChange={(e) => setActiveFileId(e.target.value)}
            className="mt-1 w-full px-3 py-2 bg-bg-elev-2 border border-border rounded-[8px] text-[13px]"
          >
            {videoFiles.map((f) => (
              <option key={f.fileId} value={f.fileId}>
                {f.filename}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-text-muted">
          Clip duration (seconds)
          <select
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="mt-1 w-full px-3 py-2 bg-bg-elev-2 border border-border rounded-[8px] text-[13px]"
          >
            <option value="0-30">Under 30s</option>
            <option value="0-60">Under 60s</option>
            <option value="0-89">Under 90s (shorts)</option>
            <option value="0-179">Under 3 min</option>
          </select>
        </label>
      </div>
      <button
        onClick={start}
        disabled={busy || (job && job.status !== "succeeded" && job.status !== "failed") || false}
        className="px-4 py-2 rounded-[10px] bg-accent text-white text-[13px] disabled:opacity-50"
      >
        {busy ? "Submitting…" : "Generate clips"}
      </button>
      {error ? <p className="mt-3 text-[12px] text-danger">{error}</p> : null}
      {job ? (
        <p className="mt-3 text-[12px] text-text-muted">
          Job <code className="text-accent-2">{job.jobId.slice(0, 8)}…</code>{" "}
          status: <span className="text-text">{job.status}</span>
          {typeof job.clipsDelivered === "number" ? (
            <> · {job.clipsDelivered} clips delivered</>
          ) : null}
          {job.fetchError ? (
            <span className="text-danger ml-2">({job.fetchError})</span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
