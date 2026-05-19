"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import type { FileItem } from "@/lib/types";

interface BrandTemplate {
  id: string;
  name: string;
  kind: "custom" | "preset";
  previewUrl: string | null;
}

export function OpusClipModal({
  fileId,
  file,
  onClose,
}: {
  fileId: string;
  file: FileItem;
  onClose: () => void;
}) {
  const [templates, setTemplates] = useState<BrandTemplate[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState<string>("");
  const [customTemplateId, setCustomTemplateId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ jobId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadTemplates = async () => {
    const res = await fetch("/api/opus/brand-templates", { cache: "no-store" });
    if (!res.ok) return;
    const body = (await res.json()) as { templates: BrandTemplate[] };
    setTemplates(body.templates);
    if (body.templates.length > 0 && !activeTemplateId) {
      setActiveTemplateId(body.templates[0].id);
    }
  };

  useEffect(() => {
    void loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedTemplateId = customTemplateId.trim() || activeTemplateId || undefined;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/opus/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId,
          brandTemplateId: selectedTemplateId,
          count: "auto",
          durationRange: "0-89",
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
      }
      const body = (await res.json()) as { jobId: string };
      setSubmitted({ jobId: body.jobId });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <Modal title="Clips submitted" subtitle={file.name} onClose={onClose} size="md">
        <div className="text-center py-4">
          <div className="inline-flex w-14 h-14 rounded-full bg-[rgba(168,85,247,0.15)] text-[#c084fc] items-center justify-center mb-4">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="6" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <line x1="20" y1="4" x2="8.12" y2="15.88" />
              <line x1="14.47" y1="14.48" x2="20" y2="20" />
              <line x1="8.12" y1="8.12" x2="12" y2="12" />
            </svg>
          </div>
          <p className="text-[14px] mb-1">Clips submitted to OpusClip</p>
          <p className="text-[12px] text-text-muted mb-4">
            Typical processing: 8–15 minutes. Clips auto-import to your Clips folder when ready.
          </p>
          <code className="block px-3 py-2 bg-bg-elev-2 border border-border rounded-[8px] text-[11px] text-text-dim mb-3">
            project {submitted.jobId}
          </code>
          <a
            href={`https://www.opus.pro/clip/${submitted.jobId}`}
            target="_blank"
            rel="noreferrer"
            className="inline-block text-[12px] text-accent-2 underline mb-5"
          >
            View in OpusClip dashboard →
          </a>
          <div>
            <button onClick={onClose} className="px-4 py-2 rounded-[8px] bg-bg-elev-3 border border-border-strong text-[13px]">
              Close
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  const customTemplates = templates.filter((t) => t.kind === "custom");
  const presetTemplates = templates.filter((t) => t.kind === "preset");

  return (
    <Modal
      title="Generate clips with OpusClip"
      subtitle={file.name}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 text-text-muted hover:text-text">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting || !selectedTemplateId}
            className="px-5 py-2.5 rounded-[10px] bg-[linear-gradient(135deg,#a855f7,#ec4899)] text-white text-[13px] font-medium disabled:opacity-60"
          >
            {submitting ? "Submitting…" : "Generate clips"}
          </button>
        </>
      }
    >
      <p className="text-[12px] text-text-muted mb-5">
        Pick a brand template. Clips are vertical 9:16, auto-length, no hook overlay, and download into this project&apos;s Clips folder when ready.
      </p>

      {customTemplates.length > 0 ? (
        <TemplateSection
          title="Your brand templates"
          templates={customTemplates}
          activeId={activeTemplateId}
          customId={customTemplateId}
          onSelect={(id) => {
            setActiveTemplateId(id);
            setCustomTemplateId("");
          }}
          onPreviewUploaded={loadTemplates}
        />
      ) : null}

      {presetTemplates.length > 0 ? (
        <TemplateSection
          title="OpusClip presets"
          templates={presetTemplates}
          activeId={activeTemplateId}
          customId={customTemplateId}
          onSelect={(id) => {
            setActiveTemplateId(id);
            setCustomTemplateId("");
          }}
          onPreviewUploaded={loadTemplates}
        />
      ) : null}

      <div className="mt-4">
        <label className="block text-[11px] text-text-muted mb-1">
          Or paste a brand template ID (overrides the selection above)
        </label>
        <input
          value={customTemplateId}
          onChange={(e) => setCustomTemplateId(e.target.value)}
          placeholder="cm6...xyz"
          className="input-op"
        />
      </div>

      <div className="mt-5 p-3 rounded-[10px] bg-bg-elev-2 border border-border text-[12px] text-text-muted">
        <span className="text-text">Format:</span> always vertical 9:16. No hook overlay.{" "}
        <span className="text-text">Length:</span> OpusClip picks 0–89s automatically.{" "}
        <span className="text-text">Count:</span> auto (5–10 clips).{" "}
        <span className="text-text">Cost:</span> 1 OpusClip credit.
      </div>

      {error ? (
        <div className="mt-4 p-3 rounded-[10px] bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-[12px] text-[#f87171]">
          {error}
        </div>
      ) : null}

      <style jsx>{`
        :global(.input-op) {
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
    </Modal>
  );
}

function TemplateSection({
  title,
  templates,
  activeId,
  customId,
  onSelect,
  onPreviewUploaded,
}: {
  title: string;
  templates: BrandTemplate[];
  activeId: string;
  customId: string;
  onSelect: (id: string) => void;
  onPreviewUploaded: () => void;
}) {
  return (
    <div className="mb-6">
      <div className="text-[12px] text-text-muted mb-2">{title}</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
        {templates.map((t) => (
          <TemplateCard
            key={t.id}
            template={t}
            selected={activeId === t.id && !customId.trim()}
            onSelect={() => onSelect(t.id)}
            onPreviewUploaded={onPreviewUploaded}
          />
        ))}
      </div>
    </div>
  );
}

function TemplateCard({
  template,
  selected,
  onSelect,
  onPreviewUploaded,
}: {
  template: BrandTemplate;
  selected: boolean;
  onSelect: () => void;
  onPreviewUploaded: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadPreview = async (file: File) => {
    setUploading(true);
    setUploadErr(null);
    setUploadProgress(0);
    try {
      const initRes = await fetch("/api/opus/template-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: template.id,
          sizeBytes: file.size,
        }),
      });
      if (!initRes.ok) {
        const b = await initRes.json().catch(() => ({}));
        throw new Error((b as { message?: string }).message ?? `init ${initRes.status}`);
      }
      const init = (await initRes.json()) as {
        uploadId: string;
        key: string;
        parts: { partNumber: number; signedUrl: string }[];
        partSizeBytes: number;
      };

      const etags: { partNumber: number; etag: string }[] = [];
      for (const p of init.parts) {
        const start = (p.partNumber - 1) * init.partSizeBytes;
        const end = Math.min(start + init.partSizeBytes, file.size);
        const blob = file.slice(start, end);
        const putRes = await fetch(p.signedUrl, { method: "PUT", body: blob });
        if (!putRes.ok) throw new Error(`part ${p.partNumber} ${putRes.status}`);
        const etagRaw = putRes.headers.get("etag") ?? "";
        etags.push({
          partNumber: p.partNumber,
          etag: etagRaw.replace(/^"|"$/g, ""),
        });
        setUploadProgress(Math.round((end / file.size) * 100));
      }

      const completeRes = await fetch("/api/opus/template-preview", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: template.id,
          uploadId: init.uploadId,
          parts: etags,
        }),
      });
      if (!completeRes.ok) throw new Error(`complete ${completeRes.status}`);

      onPreviewUploaded();
    } catch (err) {
      setUploadErr((err as Error).message);
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  return (
    <div
      className={`group relative rounded-[10px] border overflow-hidden transition ${
        selected
          ? "border-[rgba(236,72,153,0.7)] bg-[rgba(236,72,153,0.08)]"
          : "border-border bg-bg-elev-2 hover:border-border-strong"
      }`}
    >
      <button
        onClick={onSelect}
        className="block w-full text-left"
      >
        <div className="aspect-[9/16] bg-bg-elev-3 overflow-hidden">
          {template.previewUrl ? (
            <video
              src={template.previewUrl}
              className="w-full h-full object-cover"
              autoPlay
              loop
              muted
              playsInline
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-text-dim text-[11px] px-2 text-center">
              No preview yet
            </div>
          )}
        </div>
        <div className="p-2">
          <div className="text-[12px] font-medium truncate">{template.name}</div>
          <div className="text-[10px] text-text-dim truncate">{template.id}</div>
        </div>
      </button>

      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        title="Upload preview loop (MP4, under 50MB)"
        className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-bg/80 backdrop-blur border border-border-strong opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-text-muted hover:text-text disabled:opacity-100"
      >
        {uploading ? (
          <span className="text-[10px] tabular-nums">
            {uploadProgress ?? 0}%
          </span>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        )}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void uploadPreview(f);
          e.target.value = "";
        }}
      />

      {uploadErr ? (
        <div className="absolute inset-x-1 bottom-1 px-2 py-1 rounded bg-[rgba(239,68,68,0.9)] text-white text-[10px] truncate">
          {uploadErr}
        </div>
      ) : null}
    </div>
  );
}
