"use client";

// AI thumbnail studio. Generates 3 finished, titled YouTube thumbnails from
// the episode (video frames + transcript). The title is placed in an empty
// area and layered behind the people, with three distinct styles per run.
// "Use as YouTube thumbnail" saves the pick as the file's cover.

import { useEffect, useMemo, useState } from "react";
import { extractFrames } from "@/lib/frame-extract";

const FRAME_COUNT = 6;

interface FileRow {
  key: string;
  filename: string;
  fileId: string;
  url: string;
}

interface Suggestion {
  label: string;
  url: string;
  reason: string;
  headline?: string;
  style?: string;
}

function isVideo(name: string): boolean {
  return /\.(mp4|mov|webm)$/i.test(name);
}

async function readJsonOrText(
  res: Response,
): Promise<{ json: Record<string, unknown> | null; text: string }> {
  const text = await res.text();
  try {
    return { json: text ? JSON.parse(text) : null, text };
  } catch {
    return { json: null, text };
  }
}

export function ThumbnailStudio({
  files,
  focusFileId,
}: {
  files: FileRow[];
  defaultTitle?: string;
  defaultSubtitle?: string;
  focusFileId?: string;
}) {
  const videoFiles = useMemo(() => files.filter((f) => isVideo(f.filename)), [files]);

  const [sourceFileId, setSourceFileId] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [savedUrl, setSavedUrl] = useState("");
  const [note, setNote] = useState("");
  const [stylePrompt, setStylePrompt] = useState("");
  const [stage, setStage] = useState<"idle" | "working" | "saving">("idle");
  const [error, setError] = useState<string | null>(null);

  const busy = stage !== "idle";

  // Pick the source video: the focused file, else the first video.
  useEffect(() => {
    const row = focusFileId
      ? videoFiles.find((v) => v.fileId === focusFileId)
      : videoFiles[0];
    if (!row) return;
    setSourceFileId(row.fileId);
    setSourceUrl(row.url);
    setSuggestions([]);
    setSavedUrl("");
    setNote("");
  }, [focusFileId, videoFiles]);

  // Restore previously-generated thumbnails (B2 sidecars) on open so closing
  // and reopening the section keeps them.
  useEffect(() => {
    if (!sourceFileId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/files/${sourceFileId}/thumbnails`);
        if (!res.ok) return;
        const body = (await res.json()) as {
          thumbnails?: { label: string; name: string; url: string }[];
        };
        if (cancelled || !body.thumbnails) return;
        const smart = body.thumbnails
          .filter((t) => t.label.startsWith("smart-"))
          .sort((a, b) => a.label.localeCompare(b.label))
          .map((t) => ({
            label: t.label,
            url: t.url,
            reason: "Saved earlier — Redo for fresh options.",
          }));
        if (smart.length > 0) setSuggestions((cur) => (cur.length > 0 ? cur : smart));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceFileId]);

  const generate = async (redo = false) => {
    if (!sourceFileId || !sourceUrl) return;
    setError(null);
    setSavedUrl("");
    setNote("");
    setStage("working");
    try {
      const frames = await extractFrames(sourceUrl, FRAME_COUNT);
      const res = await fetch("/api/ai/thumbnails-smart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId: sourceFileId,
          framesBase64: frames,
          stylePrompt: stylePrompt.trim() || undefined,
          redo,
        }),
      });
      const { json, text } = await readJsonOrText(res);
      if (!res.ok) {
        setError(
          (json?.message as string | undefined) ||
            (res.status === 413
              ? "The video resolution is too high for upload — try a shorter clip."
              : text.slice(0, 200)) ||
            `Failed (${res.status})`,
        );
        setStage("idle");
        return;
      }
      const thumbs = (json?.thumbnails ?? []) as Suggestion[];
      if (thumbs.length === 0) {
        setError("No thumbnails came back. Try again.");
        setStage("idle");
        return;
      }
      setSuggestions(thumbs);
      if (typeof json?.note === "string") setNote(json.note);
      setStage("idle");
    } catch (err) {
      setError((err as Error).message);
      setStage("idle");
    }
  };

  const useAsCover = async (url: string) => {
    if (!sourceFileId) return;
    setError(null);
    setStage("saving");
    try {
      const res = await fetch("/api/ai/save-cover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: sourceFileId, sourceUrl: url, label: "cover" }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { message?: string };
        setError(d.message || `Save failed (${res.status})`);
        setStage("idle");
        return;
      }
      setSavedUrl(url);
      window.dispatchEvent(new CustomEvent("onpod:thumbnail-saved"));
      setStage("idle");
    } catch (err) {
      setError((err as Error).message);
      setStage("idle");
    }
  };

  if (videoFiles.length === 0) {
    return (
      <div className="text-[12px] text-text-muted">
        No video in this file to make a thumbnail from.
      </div>
    );
  }

  const hasResults = suggestions.length > 0;

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-[15px] font-semibold">AI thumbnails</h2>
        <p className="text-[12px] text-text-muted mt-0.5">
          Reads the episode (video + transcript), picks the 3 best moments, and
          designs a titled thumbnail for each — the title sits behind the people,
          in 3 different styles. Requires a transcript.
        </p>
      </div>

      <input
        value={stylePrompt}
        onChange={(e) => setStylePrompt(e.target.value)}
        disabled={busy}
        placeholder="Optional style notes — e.g. “red title”, “title at the bottom”, “darker mood”"
        className="w-full px-3 py-2 rounded-[10px] bg-bg-elev-2 border border-border text-[12px] placeholder:text-text-dim disabled:opacity-50"
      />

      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <button
          onClick={() => void generate(false)}
          disabled={busy}
          className="px-4 py-2 rounded-[10px] bg-accent text-white text-[13px] font-medium disabled:opacity-60"
        >
          {stage === "working"
            ? "Designing… (~30s)"
            : hasResults
              ? "✨ Generate new set"
              : "✨ Generate thumbnails"}
        </button>
        {hasResults ? (
          <button
            onClick={() => void generate(true)}
            disabled={busy}
            title="Generate a fresh, different set (uses your style notes)"
            className="px-3 py-2 rounded-[10px] border border-accent-2 text-accent-2 text-[12px] disabled:opacity-50"
          >
            {stage === "working" ? "Redoing…" : "🔄 Redo"}
          </button>
        ) : null}
        {stage === "working" ? (
          <span className="text-[11px] text-text-muted">
            Designing fresh thumbnails…
          </span>
        ) : null}
      </div>

      {error ? (
        <div className="mt-3 p-3 rounded-[10px] bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-[12px] text-[#f87171]">
          {error}
        </div>
      ) : null}
      {note && !error ? (
        <p className="mt-3 text-[11px] text-text-muted">{note}</p>
      ) : null}

      {hasResults ? (
        <div
          className={`mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 ${
            stage === "working" ? "opacity-50 pointer-events-none" : ""
          }`}
        >
          {suggestions.map((s, i) => {
            const saved = savedUrl === s.url;
            return (
              <div
                key={s.label || i}
                className={`rounded-[10px] border overflow-hidden bg-bg-elev-2 ${
                  saved ? "border-accent" : "border-border"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.url}
                  alt={s.headline || s.label}
                  className="w-full aspect-video object-cover block"
                />
                <div className="p-2">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    {s.headline ? (
                      <div className="text-[12px] font-semibold truncate">{s.headline}</div>
                    ) : (
                      <span />
                    )}
                    {s.style ? (
                      <span className="shrink-0 text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-bg-elev-3 border border-border text-text-muted">
                        {s.style}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-[11px] text-text-muted">{s.reason}</div>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => void useAsCover(s.url)}
                      disabled={busy}
                      className={`px-2.5 py-1 rounded-[8px] text-[11px] disabled:opacity-50 ${
                        saved
                          ? "bg-bg-elev-3 border border-accent text-accent"
                          : "bg-accent text-white"
                      }`}
                    >
                      {saved ? "✓ Saved for YouTube" : "Use as YouTube thumbnail"}
                    </button>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-accent-2 underline"
                    >
                      Open full
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {savedUrl ? (
        <p className="mt-3 text-[11px] text-accent">
          ✓ Saved as this episode&apos;s cover — it&apos;s the thumbnail when you publish to YouTube.
        </p>
      ) : null}

      {!hasResults && stage !== "working" ? (
        <div className="mt-4 grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="aspect-video rounded-[10px] border border-dashed border-border bg-bg-elev-2 flex items-center justify-center text-[11px] text-text-dim"
            >
              Thumbnail {i + 1}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
