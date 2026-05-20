"use client";

// Unified thumbnail flow:
//   1. Pick a video file from the session
//   2. Pull frames in the browser
//   3. Pick the frame you want
//   4. Optional: enhance it with Gemini (in-place upgrade)
//   5. Pick a Bannerbear template, fill text fields, render
//
// The chosen frame URL is auto-injected into the first image-typed
// modification on the template (image / photo / avatar / logo).

import { useEffect, useMemo, useState } from "react";
import { extractFrames } from "@/lib/frame-extract";

interface FileRow {
  key: string;
  filename: string;
  fileId: string;
  url: string;
}

interface Template {
  uid: string;
  name: string;
  preview_url?: string;
  available_modifications?: { name: string; type: string }[];
}

interface FrameOption {
  url: string;
  label: string;
  source: "auto-pick" | "all" | "enhanced";
}

const FRAME_COUNT = 6;

function isVideo(name: string): boolean {
  return /\.(mp4|mov|webm)$/i.test(name);
}

function isImageField(name: string): boolean {
  return /(image|photo|avatar|logo|picture|pic|background)/i.test(name);
}

export function ThumbnailStudio({
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
  const [frames, setFrames] = useState<FrameOption[]>([]);
  const [activeFrameUrl, setActiveFrameUrl] = useState<string>("");
  const [stage, setStage] = useState<
    "idle" | "extracting" | "vision" | "enhancing" | "rendering"
  >("idle");
  const [error, setError] = useState<string | null>(null);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [aiSuggested, setAiSuggested] = useState(false);
  const [result, setResult] = useState<{ url: string } | null>(null);

  // Default file selection
  useEffect(() => {
    if (videoFiles.length > 0 && !sourceFileId) {
      setSourceFileId(videoFiles[0].fileId);
      setSourceUrl(videoFiles[0].url);
    }
  }, [videoFiles, sourceFileId]);

  // Load Bannerbear templates once
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/ai/bannerbear/templates");
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setTemplatesError(data.message || `Templates ${res.status}`);
          return;
        }
        const data = await res.json();
        setTemplates(data.templates ?? []);
      } catch (err) {
        setTemplatesError((err as Error).message);
      }
    })();
  }, []);

  const tmpl = templates.find((t) => t.uid === selectedTemplate);
  const imageFieldName = tmpl?.available_modifications?.find((m) =>
    isImageField(m.name),
  )?.name;

  // Prefill text fields when template changes
  useEffect(() => {
    if (!tmpl) return;
    const next: Record<string, string> = {};
    for (const m of tmpl.available_modifications ?? []) {
      if (isImageField(m.name)) continue;
      if (m.type === "text" && /title/i.test(m.name) && defaultTitle) {
        next[m.name] = defaultTitle;
      } else if (m.type === "text" && /subtitle|host|guest/i.test(m.name) && defaultSubtitle) {
        next[m.name] = defaultSubtitle;
      } else {
        next[m.name] = "";
      }
    }
    setValues(next);
  }, [tmpl, defaultTitle, defaultSubtitle]);

  // Pull title suggestion from AI metadata once per source change
  useEffect(() => {
    if (!sourceFileId || aiSuggested) return;
    void (async () => {
      try {
        const res = await fetch(
          `/api/transcribe/${sourceFileId}/status?include=data`,
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data.ai?.title && tmpl) {
          const titleField = tmpl.available_modifications?.find(
            (m) => m.type === "text" && /title/i.test(m.name),
          );
          if (titleField) {
            setValues((prev) =>
              prev[titleField.name] ? prev : { ...prev, [titleField.name]: data.ai.title },
            );
          }
        }
        setAiSuggested(true);
      } catch {
        /* ignore */
      }
    })();
  }, [sourceFileId, aiSuggested, tmpl]);

  async function pickFrames(mode: "auto" | "all") {
    if (!sourceFileId || !sourceUrl) return;
    setError(null);
    setFrames([]);
    setActiveFrameUrl("");
    setStage("extracting");
    try {
      const raw = await extractFrames(sourceUrl, FRAME_COUNT);
      if (mode === "auto") {
        setStage("vision");
        const res = await fetch("/api/ai/thumbnails", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId: sourceFileId, framesBase64: raw }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.message || `Pick failed (${res.status})`);
          setStage("idle");
          return;
        }
        const list: FrameOption[] = (data.thumbnails as { label: string; url: string }[]).map(
          (t) => ({ url: t.url, label: t.label, source: "auto-pick" }),
        );
        setFrames(list);
        if (list[0]) {
          setActiveFrameUrl(list[0].url);
          autofillImageField(list[0].url);
        }
        setStage("idle");
        return;
      }

      // mode === "all": upload each frame to B2 and show all 6
      const all: FrameOption[] = [];
      for (let i = 0; i < raw.length; i++) {
        const res = await fetch("/api/ai/thumbnails", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileId: sourceFileId,
            framesBase64: [raw[i]],
          }),
        });
        const data = await res.json();
        const t = data.thumbnails?.[0];
        if (t) all.push({ url: t.url, label: `Frame ${i + 1}`, source: "all" });
      }
      setFrames(all);
      if (all[0]) {
        setActiveFrameUrl(all[0].url);
        autofillImageField(all[0].url);
      }
      setStage("idle");
    } catch (err) {
      setError((err as Error).message);
      setStage("idle");
    }
  }

  function autofillImageField(url: string) {
    if (!imageFieldName) return;
    setValues((prev) => ({ ...prev, [imageFieldName]: url }));
  }

  function chooseFrame(url: string) {
    setActiveFrameUrl(url);
    autofillImageField(url);
  }

  async function enhance() {
    if (!sourceFileId || !activeFrameUrl) return;
    setStage("enhancing");
    setError(null);
    try {
      const res = await fetch("/api/ai/enhance-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId: sourceFileId,
          imageUrl: activeFrameUrl,
          label: `enhanced-${Date.now()}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || `Enhance failed (${res.status})`);
        setStage("idle");
        return;
      }
      const newFrame: FrameOption = {
        url: data.url,
        label: "Enhanced",
        source: "enhanced",
      };
      setFrames((prev) => [newFrame, ...prev]);
      setActiveFrameUrl(data.url);
      autofillImageField(data.url);
      setStage("idle");
    } catch (err) {
      setError((err as Error).message);
      setStage("idle");
    }
  }

  async function render() {
    if (!tmpl || !sourceFileId) return;
    setStage("rendering");
    setError(null);
    setResult(null);
    try {
      const modifications = Object.entries(values)
        .filter(([, v]) => v && v.trim().length > 0)
        .map(([name, v]) =>
          isImageField(name) ? { name, image_url: v } : { name, text: v },
        );
      const res = await fetch("/api/ai/bannerbear/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId: sourceFileId,
          templateId: tmpl.uid,
          modifications,
          slug: tmpl.name,
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

  const busy = stage !== "idle";

  return (
    <div className="bg-bg-elev border border-border rounded-[16px] p-4 mb-4">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h2 className="text-[14px] font-semibold">Thumbnail studio</h2>
          <p className="text-[12px] text-text-muted">
            Pick a frame from the video, enhance it if needed, then drop it
            into a Bannerbear template.
          </p>
        </div>
        <select
          value={sourceFileId}
          onChange={(e) => {
            const fid = e.target.value;
            const row = videoFiles.find((v) => v.fileId === fid);
            setSourceFileId(fid);
            setSourceUrl(row?.url ?? "");
            setFrames([]);
            setActiveFrameUrl("");
            setAiSuggested(false);
            setResult(null);
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

      {/* Step 1 — pick frames */}
      <div className="mb-4">
        <div className="text-[11px] uppercase tracking-wider text-text-dim mb-2">
          1 · Pick a frame
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => pickFrames("auto")}
            disabled={busy}
            className="px-3 py-2 rounded-[10px] bg-accent text-white text-[12px] disabled:opacity-50"
          >
            {stage === "extracting"
              ? "Extracting…"
              : stage === "vision"
                ? "Vision picking…"
                : "Auto-pick best frames"}
          </button>
          <button
            onClick={() => pickFrames("all")}
            disabled={busy}
            className="px-3 py-2 rounded-[10px] bg-bg-elev-2 border border-border text-[12px] disabled:opacity-50"
          >
            Show all {FRAME_COUNT} frames
          </button>
        </div>

        {frames.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-3">
            {frames.map((f) => (
              <button
                key={f.url}
                onClick={() => chooseFrame(f.url)}
                className={`relative rounded-[10px] overflow-hidden border-2 transition ${
                  activeFrameUrl === f.url
                    ? "border-accent"
                    : "border-border hover:border-border-strong"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={f.label} className="w-full block" />
                <div
                  className={`absolute top-1 left-1 px-2 py-0.5 rounded-full text-[10px] uppercase ${
                    f.source === "enhanced"
                      ? "bg-accent-2 text-bg"
                      : "bg-black/70 text-white"
                  }`}
                >
                  {f.label}
                </div>
              </button>
            ))}
          </div>
        ) : null}

        {activeFrameUrl ? (
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={enhance}
              disabled={busy}
              className="px-3 py-2 rounded-[10px] bg-bg-elev-2 border border-border text-[12px] disabled:opacity-50"
            >
              {stage === "enhancing" ? "Enhancing with Gemini…" : "✨ Enhance with Gemini"}
            </button>
            <span className="text-[11px] text-text-dim">
              Sharpens, lifts shadows, balances color. Slow (~10–20s).
            </span>
          </div>
        ) : null}
      </div>

      {/* Step 2 — Bannerbear template */}
      <div>
        <div className="text-[11px] uppercase tracking-wider text-text-dim mb-2">
          2 · Bannerbear template
        </div>

        {templatesError ? (
          <div className="text-[12px] text-danger mb-3">
            {templatesError}. Set <code>BANNERBEAR_API_KEY</code> in Vercel.
          </div>
        ) : null}

        <select
          value={selectedTemplate}
          onChange={(e) => {
            setSelectedTemplate(e.target.value);
            setResult(null);
          }}
          className="w-full px-3 py-2 bg-bg-elev-2 border border-border rounded-[8px] text-[13px] mb-3"
          disabled={templates.length === 0}
        >
          <option value="">— Choose a template —</option>
          {templates.map((t) => (
            <option key={t.uid} value={t.uid}>
              {t.name}
            </option>
          ))}
        </select>

        {tmpl ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tmpl.preview_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={tmpl.preview_url}
                alt={tmpl.name}
                className="rounded-[10px] border border-border w-full"
              />
            ) : null}
            <div className="space-y-2">
              {(tmpl.available_modifications ?? []).map((m) => {
                const isImg = isImageField(m.name);
                if (isImg) {
                  return (
                    <div key={m.name} className="text-[11px] text-text-muted">
                      {m.name}{" "}
                      <span className="text-text-dim">
                        (auto-set to selected frame)
                      </span>
                      {values[m.name] ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={values[m.name]}
                          alt=""
                          className="mt-1 rounded-[8px] border border-border w-full"
                        />
                      ) : (
                        <input
                          type="url"
                          value={values[m.name] ?? ""}
                          onChange={(e) =>
                            setValues((prev) => ({
                              ...prev,
                              [m.name]: e.target.value,
                            }))
                          }
                          placeholder="Pick a frame above, or paste an image URL"
                          className="mt-1 w-full px-3 py-2 bg-bg-elev-2 border border-border rounded-[8px] text-[13px]"
                        />
                      )}
                    </div>
                  );
                }
                return (
                  <label key={m.name} className="block text-[11px] text-text-muted">
                    {m.name}
                    <input
                      type="text"
                      value={values[m.name] ?? ""}
                      onChange={(e) =>
                        setValues((prev) => ({
                          ...prev,
                          [m.name]: e.target.value,
                        }))
                      }
                      className="mt-1 w-full px-3 py-2 bg-bg-elev-2 border border-border rounded-[8px] text-[13px]"
                    />
                  </label>
                );
              })}
              <button
                onClick={render}
                disabled={busy || !sourceFileId}
                className="mt-2 px-4 py-2 rounded-[10px] bg-accent text-white text-[13px] disabled:opacity-50"
              >
                {stage === "rendering" ? "Rendering…" : "Generate thumbnail"}
              </button>
            </div>
          </div>
        ) : null}
      </div>

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
