"use client";

// Unified thumbnail flow:
//   1. Pick a video file from the session
//   2. Pull frames in the browser (auto-pick via Claude Vision or all 6)
//   3. Pick a frame; optionally Enhance (Gemini) or Remove background
//      (remove.bg) and/or Adjust crop (CropZoom)
//   4. Pick a Bannerbear template; each image-typed layer gets its own
//      independent picker so you can set background, foreground, logo
//      etc. without one auto-overriding another
//   5. Render, save (also writes .cover.jpg so YouTube picks it up)
//
// "Use selected frame" sets a layer to the currently-selected frame URL.
// "Clear" empties a layer so the template's default applies — useful
// when the template has a background layer you don't want to override.

import { useEffect, useMemo, useRef, useState } from "react";
import { extractFrames } from "@/lib/frame-extract";
import { CropZoom } from "./CropZoom";
import {
  cropBase64Region,
  fileToBase64,
  flipImageHorizontal,
} from "@/lib/image-ops";

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
  source:
    | "auto-pick"
    | "all"
    | "enhanced"
    | "no-bg"
    | "adjusted"
    | "person"
    | "upload"
    | "flipped";
  transparent?: boolean;
}

const FRAME_COUNT = 6;

function isVideo(name: string): boolean {
  return /\.(mp4|mov|webm)$/i.test(name);
}

function isImageField(name: string): boolean {
  return /(image|photo|avatar|logo|picture|pic|background|container)/i.test(name);
}

export function ThumbnailStudio({
  files,
  defaultTitle = "",
  defaultSubtitle = "",
  focusFileId,
}: {
  files: FileRow[];
  defaultTitle?: string;
  defaultSubtitle?: string;
  focusFileId?: string;
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
    | "idle"
    | "extracting"
    | "vision"
    | "enhancing"
    | "removing-bg"
    | "saving-crop"
    | "flipping"
    | "uploading"
    | "finding-people"
    | "rendering"
  >("idle");
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [aiSuggested, setAiSuggested] = useState(false);
  const [result, setResult] = useState<{ url: string } | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropTarget, setCropTarget] = useState<{ layer?: string }>({});

  // Default file selection
  useEffect(() => {
    if (videoFiles.length > 0 && !sourceFileId) {
      setSourceFileId(videoFiles[0].fileId);
      setSourceUrl(videoFiles[0].url);
    }
  }, [videoFiles, sourceFileId]);

  useEffect(() => {
    if (!focusFileId) return;
    const row = videoFiles.find((v) => v.fileId === focusFileId);
    if (!row) return;
    setSourceFileId(row.fileId);
    setSourceUrl(row.url);
    setFrames([]);
    setActiveFrameUrl("");
    setAiSuggested(false);
    setResult(null);
  }, [focusFileId, videoFiles]);

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

  // Prefill text fields when template changes (but DON'T auto-set image fields)
  useEffect(() => {
    if (!tmpl) return;
    const next: Record<string, string> = {};
    for (const m of tmpl.available_modifications ?? []) {
      if (isImageField(m.name)) {
        next[m.name] = "";
        continue;
      }
      if (m.type === "text" && /title/i.test(m.name) && defaultTitle) {
        next[m.name] = defaultTitle;
      } else if (
        m.type === "text" &&
        /subtitle|host|guest/i.test(m.name) &&
        defaultSubtitle
      ) {
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
              prev[titleField.name]
                ? prev
                : { ...prev, [titleField.name]: data.ai.title },
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
        if (list[0]) setActiveFrameUrl(list[0].url);
        setStage("idle");
        return;
      }

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
      if (all[0]) setActiveFrameUrl(all[0].url);
      setStage("idle");
    } catch (err) {
      setError((err as Error).message);
      setStage("idle");
    }
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
      setStage("idle");
    } catch (err) {
      setError((err as Error).message);
      setStage("idle");
    }
  }

  async function removeBg() {
    if (!sourceFileId || !activeFrameUrl) return;
    setStage("removing-bg");
    setError(null);
    try {
      const res = await fetch("/api/ai/remove-background", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId: sourceFileId,
          imageUrl: activeFrameUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || `Remove-bg failed (${res.status})`);
        setStage("idle");
        return;
      }
      // Replace the input frame in the strip rather than prepending, so
      // we don't accumulate duplicates each time the user clicks.
      const replaced: FrameOption = {
        url: data.url,
        label: "No background",
        source: "no-bg",
        transparent: true,
      };
      setFrames((prev) => {
        const without = prev.filter((f) => f.url !== activeFrameUrl);
        return [replaced, ...without];
      });
      setActiveFrameUrl(data.url);
      setStage("idle");
    } catch (err) {
      setError((err as Error).message);
      setStage("idle");
    }
  }

  async function flip() {
    if (!sourceFileId || !activeFrameUrl) return;
    setStage("flipping");
    setError(null);
    try {
      const b64 = await flipImageHorizontal(activeFrameUrl);
      const res = await fetch("/api/ai/upload-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId: sourceFileId,
          imageBase64: b64,
          label: `flipped-${Date.now()}`,
          mimeType: "image/png",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Flip failed");
        setStage("idle");
        return;
      }
      // Carry forward transparency flag if the source was a no-bg PNG.
      const src = frames.find((f) => f.url === activeFrameUrl);
      const next: FrameOption = {
        url: data.url,
        label: "Flipped",
        source: "flipped",
        transparent: src?.transparent ?? activeFrameUrl.endsWith(".png"),
      };
      setFrames((prev) => [next, ...prev]);
      setActiveFrameUrl(data.url);
      setStage("idle");
    } catch (err) {
      setError((err as Error).message);
      setStage("idle");
    }
  }

  async function uploadFiles(fileList: FileList | null) {
    if (!fileList || !sourceFileId) return;
    setStage("uploading");
    setError(null);
    try {
      for (const f of Array.from(fileList)) {
        const { base64, mime } = await fileToBase64(f);
        const res = await fetch("/api/ai/upload-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileId: sourceFileId,
            imageBase64: base64,
            label: `upload-${Date.now()}`,
            mimeType: mime,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || `Upload failed (${res.status})`);
        const next: FrameOption = {
          url: data.url,
          label: f.name.slice(0, 24),
          source: "upload",
          transparent: mime.includes("png"),
        };
        setFrames((prev) => [next, ...prev]);
        setActiveFrameUrl(data.url);
      }
      setStage("idle");
    } catch (err) {
      setError((err as Error).message);
      setStage("idle");
    }
  }

  async function findPeople() {
    if (!sourceFileId || !sourceUrl) return;
    setError(null);
    setStage("extracting");
    try {
      const raw = await extractFrames(sourceUrl, FRAME_COUNT);
      setStage("finding-people");
      const visionRes = await fetch("/api/ai/find-people", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: sourceFileId, framesBase64: raw }),
      });
      const visionData = await visionRes.json();
      if (!visionRes.ok) {
        setError(visionData.message || `Find people failed (${visionRes.status})`);
        setStage("idle");
        return;
      }
      const people = (visionData.people ?? []) as Array<{
        frameIndex: number;
        x: number;
        y: number;
        width: number;
        height: number;
        label: string;
      }>;
      if (people.length === 0) {
        setError("No people detected in the sampled frames.");
        setStage("idle");
        return;
      }

      // Browser-side crop + upload + remove-bg per person
      setStage("removing-bg");
      const newFrames: FrameOption[] = [];
      for (let i = 0; i < people.length; i++) {
        const p = people[i];
        const frameB64 = raw[p.frameIndex];
        if (!frameB64) continue;
        const cropped = await cropBase64Region(frameB64, p, 0.12);
        // Save cropped JPEG so remove.bg can fetch it by URL.
        const upRes = await fetch("/api/ai/upload-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileId: sourceFileId,
            imageBase64: cropped,
            label: `person-${i + 1}-raw-${Date.now()}`,
            mimeType: "image/jpeg",
          }),
        });
        const upData = await upRes.json();
        if (!upRes.ok) continue;

        // Now strip the background
        const rbRes = await fetch("/api/ai/remove-background", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileId: sourceFileId,
            imageUrl: upData.url,
            label: `person-${i + 1}-${Date.now()}`,
          }),
        });
        const rbData = await rbRes.json();
        if (rbRes.ok) {
          newFrames.push({
            url: rbData.url,
            label: p.label || `Person ${i + 1}`,
            source: "person",
            transparent: true,
          });
        } else {
          // Fall back to the raw crop if remove-bg fails
          newFrames.push({
            url: upData.url,
            label: `${p.label || `Person ${i + 1}`} (raw)`,
            source: "person",
          });
        }
      }
      if (newFrames.length === 0) {
        setError("Detected people but cutout failed for all of them.");
        setStage("idle");
        return;
      }
      setFrames((prev) => [...newFrames, ...prev]);
      setActiveFrameUrl(newFrames[0].url);
      setStage("idle");
    } catch (err) {
      setError((err as Error).message);
      setStage("idle");
    }
  }

  function openCrop(layerName?: string) {
    if (!activeFrameUrl) return;
    setCropTarget({ layer: layerName });
    setCropOpen(true);
  }

  async function applyCrop(payload: { base64: string; mime: string }) {
    if (!sourceFileId) return;
    setCropOpen(false);
    setStage("saving-crop");
    try {
      const res = await fetch("/api/ai/upload-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId: sourceFileId,
          imageBase64: payload.base64,
          label: `adj-${Date.now()}`,
          mimeType: payload.mime,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Save crop failed");
        setStage("idle");
        return;
      }
      const isTransparent = payload.mime.includes("png");
      const newFrame: FrameOption = {
        url: data.url,
        label: "Adjusted",
        source: "adjusted",
        transparent: isTransparent,
      };
      setFrames((prev) => [newFrame, ...prev]);
      setActiveFrameUrl(data.url);
      if (cropTarget.layer) {
        setValues((prev) => ({ ...prev, [cropTarget.layer!]: data.url }));
      }
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
      // Only send modifications the user explicitly set. Leaving a value
      // empty lets the template's default apply — important when a
      // template has multiple image layers and only one is being changed.
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
      window.dispatchEvent(new CustomEvent("onpod:thumbnail-saved"));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStage("idle");
    }
  }

  function openYouTube() {
    if (!sourceFileId) return;
    window.dispatchEvent(
      new CustomEvent("onpod:open-youtube", { detail: { fileId: sourceFileId } }),
    );
  }

  if (videoFiles.length === 0) return null;

  const busy = stage !== "idle";

  return (
    <div className="bg-bg-elev border border-border rounded-[16px] p-4 mb-4">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h2 className="text-[14px] font-semibold">Thumbnail studio</h2>
          <p className="text-[12px] text-text-muted">
            Pick frames, polish them, then drop into Bannerbear. Each
            template layer is set independently.
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
      <div className="mb-5">
        <div className="text-[11px] uppercase tracking-wider text-text-dim mb-2">
          1 · Pick + polish a frame
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
            onClick={findPeople}
            disabled={busy}
            className="px-3 py-2 rounded-[10px] bg-bg-elev-2 border border-border text-[12px] disabled:opacity-50"
          >
            {stage === "finding-people"
              ? "Vision finding people…"
              : "👥 Find 1–4 speakers (auto cutout)"}
          </button>
          <button
            onClick={() => pickFrames("all")}
            disabled={busy}
            className="px-3 py-2 rounded-[10px] bg-bg-elev-2 border border-border text-[12px] disabled:opacity-50"
          >
            Show all {FRAME_COUNT} frames
          </button>
          <button
            onClick={() => uploadRef.current?.click()}
            disabled={busy}
            className="px-3 py-2 rounded-[10px] bg-bg-elev-2 border border-border text-[12px] disabled:opacity-50"
          >
            {stage === "uploading" ? "Uploading…" : "⬆︎ Upload image"}
          </button>
          <input
            ref={uploadRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => void uploadFiles(e.target.files)}
          />
        </div>

        {frames.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-3">
            {frames.map((f) => (
              <button
                key={f.url}
                onClick={() => setActiveFrameUrl(f.url)}
                className={`relative rounded-[10px] overflow-hidden border-2 transition ${
                  activeFrameUrl === f.url
                    ? "border-accent"
                    : "border-border hover:border-border-strong"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={f.url}
                  alt={f.label}
                  className="w-full block"
                  style={
                    f.transparent
                      ? {
                          backgroundImage:
                            "linear-gradient(45deg, rgba(255,255,255,0.06) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.06) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.06) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.06) 75%)",
                          backgroundSize: "16px 16px",
                          backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
                          backgroundColor: "#1a1a1d",
                        }
                      : undefined
                  }
                />
                <div
                  className={`absolute top-1 left-1 px-2 py-0.5 rounded-full text-[10px] uppercase ${
                    f.source === "enhanced" ||
                    f.source === "no-bg" ||
                    f.source === "adjusted" ||
                    f.source === "person" ||
                    f.source === "flipped"
                      ? "bg-accent-2 text-bg"
                      : f.source === "upload"
                        ? "bg-accent text-white"
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
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <button
              onClick={enhance}
              disabled={busy}
              className="px-3 py-2 rounded-[10px] bg-bg-elev-2 border border-border text-[12px] disabled:opacity-50"
            >
              {stage === "enhancing" ? "Enhancing…" : "✨ Enhance"}
            </button>
            <button
              onClick={removeBg}
              disabled={busy}
              className="px-3 py-2 rounded-[10px] bg-bg-elev-2 border border-border text-[12px] disabled:opacity-50"
            >
              {stage === "removing-bg" ? "Removing…" : "✂️ Remove BG"}
            </button>
            <button
              onClick={() => openCrop()}
              disabled={busy}
              className="px-3 py-2 rounded-[10px] bg-bg-elev-2 border border-border text-[12px] disabled:opacity-50"
            >
              {stage === "saving-crop" ? "Saving…" : "🔍 Adjust / zoom"}
            </button>
            <button
              onClick={flip}
              disabled={busy}
              className="px-3 py-2 rounded-[10px] bg-bg-elev-2 border border-border text-[12px] disabled:opacity-50"
            >
              {stage === "flipping" ? "Flipping…" : "⇆ Flip horizontal"}
            </button>
            <span className="text-[11px] text-text-dim">
              Enhance · cutout · adjust · flip · or upload your own.
            </span>
          </div>
        ) : null}
      </div>

      {/* Step 2 — Bannerbear template */}
      <div>
        <div className="text-[11px] uppercase tracking-wider text-text-dim mb-2">
          2 · Drop into template
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
            <div className="space-y-3">
              {(tmpl.available_modifications ?? []).map((m) => {
                const isImg = isImageField(m.name);
                if (isImg) {
                  const currentVal = values[m.name] ?? "";
                  return (
                    <div key={m.name} className="space-y-1">
                      <div className="text-[11px] text-text-muted">
                        <code className="text-accent-2">{m.name}</code>
                        <span className="text-text-dim ml-2">
                          (image layer · empty = template default)
                        </span>
                      </div>
                      {currentVal ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={currentVal}
                          alt=""
                          className="rounded-[8px] border border-border w-full bg-bg-elev-3"
                        />
                      ) : (
                        <div className="rounded-[8px] border border-dashed border-border bg-bg-elev-3 text-center text-[11px] text-text-dim py-6">
                          (empty — template default will be used)
                        </div>
                      )}
                      <div className="flex items-center gap-2 flex-wrap mt-1">
                        <button
                          onClick={() =>
                            setValues((prev) => ({ ...prev, [m.name]: activeFrameUrl }))
                          }
                          disabled={!activeFrameUrl}
                          className="px-2.5 py-1.5 rounded-[8px] bg-accent text-white text-[11px] disabled:opacity-40"
                        >
                          Use selected frame
                        </button>
                        <button
                          onClick={() => openCrop(m.name)}
                          disabled={!activeFrameUrl}
                          className="px-2.5 py-1.5 rounded-[8px] bg-bg-elev-2 border border-border text-[11px] disabled:opacity-40"
                        >
                          Adjust + apply
                        </button>
                        <button
                          onClick={() =>
                            setValues((prev) => ({ ...prev, [m.name]: "" }))
                          }
                          className="px-2.5 py-1.5 rounded-[8px] bg-bg-elev-2 border border-border text-[11px]"
                        >
                          Clear
                        </button>
                      </div>
                      <input
                        type="url"
                        value={currentVal}
                        onChange={(e) =>
                          setValues((prev) => ({
                            ...prev,
                            [m.name]: e.target.value,
                          }))
                        }
                        placeholder="…or paste an image URL"
                        className="w-full px-3 py-1.5 bg-bg-elev-2 border border-border rounded-[8px] text-[12px] font-mono"
                      />
                    </div>
                  );
                }
                return (
                  <label
                    key={m.name}
                    className="block text-[11px] text-text-muted"
                  >
                    <code className="text-accent-2">{m.name}</code>
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
        <div className="mt-5 p-3 bg-bg-elev-2 border border-border rounded-[10px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={result.url}
            alt="Final thumbnail"
            className="rounded-[8px] border border-border max-w-full"
          />
          <p className="text-[11px] text-text-muted mt-2 break-all">
            Saved to: {result.url}
          </p>
          <p className="text-[11px] text-success mt-1">
            ✓ Also saved as <code>.cover.jpg</code> — YouTube modal will preselect it.
          </p>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <button
              onClick={openYouTube}
              className="px-3 py-2 rounded-[10px] bg-accent text-white text-[12px]"
            >
              🚀 Save & post to YouTube
            </button>
            <a
              href={result.url}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-2 rounded-[10px] bg-bg-elev-3 border border-border text-[12px]"
            >
              Open full size
            </a>
          </div>
        </div>
      ) : null}

      <CropZoom
        open={cropOpen}
        imageUrl={activeFrameUrl}
        onCancel={() => setCropOpen(false)}
        onApply={applyCrop}
      />
    </div>
  );
}
