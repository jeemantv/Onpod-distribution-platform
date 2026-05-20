"use client";

import { useEffect, useMemo, useState } from "react";

interface FileRow {
  key: string;
  filename: string;
  fileId: string;
}

interface AIPackage {
  title: string;
  description: string;
  tags: string[];
  hashtags: string[];
  language: string;
  chapters: string;
  summary: string;
}

function isVideo(name: string): boolean {
  return /\.(mp4|mov|webm|m4a|mp3|wav|flac)$/i.test(name);
}

export function AIMetadataPanel({
  files,
  focusFileId,
}: {
  files: FileRow[];
  focusFileId?: string;
}) {
  const videoFiles = useMemo(
    () => files.filter((f) => isVideo(f.filename)),
    [files],
  );
  const [activeFileId, setActiveFileId] = useState<string>("");
  const [ai, setAi] = useState<AIPackage | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (videoFiles.length > 0 && !activeFileId) {
      setActiveFileId(videoFiles[0].fileId);
    }
  }, [videoFiles, activeFileId]);

  useEffect(() => {
    if (focusFileId && videoFiles.some((f) => f.fileId === focusFileId)) {
      setActiveFileId(focusFileId);
    }
  }, [focusFileId, videoFiles]);

  useEffect(() => {
    if (!activeFileId) return;
    let cancelled = false;
    setLoading(true);
    setAi(null);
    void (async () => {
      try {
        const res = await fetch(
          `/api/transcribe/${activeFileId}/status?include=data`,
        );
        const data = await res.json();
        if (cancelled) return;
        if (data.status === "ready" && data.ai) {
          setAi(data.ai as AIPackage);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeFileId]);

  if (videoFiles.length === 0) return null;

  return (
    <div className="bg-bg-elev border border-border rounded-[16px] p-4 mb-4">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h2 className="text-[14px] font-semibold">AI metadata</h2>
        <select
          value={activeFileId}
          onChange={(e) => setActiveFileId(e.target.value)}
          className="px-3 py-1.5 bg-bg-elev-2 border border-border rounded-[8px] text-[12px]"
        >
          {videoFiles.map((f) => (
            <option key={f.fileId} value={f.fileId}>
              {f.filename}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-[12px] text-text-muted">Loading…</p>
      ) : !ai ? (
        <p className="text-[12px] text-text-muted">
          No metadata yet. Run Transcribe on this file — Claude generates the
          package automatically once the transcript is ready.
        </p>
      ) : (
        <div className="space-y-3 text-[13px]">
          <Field label="Title" value={ai.title} />
          <Field label="Summary" value={ai.summary} multiline />
          <Field label="Description" value={ai.description} multiline />
          <Field label="Chapters" value={ai.chapters} multiline mono />
          <Field label="Tags" value={ai.tags.join(", ")} />
          <Field label="Hashtags" value={ai.hashtags.join(" ")} />
          <div className="text-[11px] text-text-dim">
            Detected language: {ai.language || "—"}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  multiline,
  mono,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] text-text-muted mb-1">{label}</div>
      {multiline ? (
        <pre
          className={`whitespace-pre-wrap bg-bg-elev-2 border border-border rounded-[8px] px-3 py-2 ${
            mono ? "font-mono text-[12px]" : ""
          }`}
        >
          {value}
        </pre>
      ) : (
        <div className="bg-bg-elev-2 border border-border rounded-[8px] px-3 py-2">
          {value}
        </div>
      )}
    </div>
  );
}
