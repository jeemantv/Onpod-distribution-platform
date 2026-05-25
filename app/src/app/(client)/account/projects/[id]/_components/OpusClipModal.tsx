"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import type { FileItem } from "@/lib/types";
import type { VizardTemplate } from "@/lib/vizard-templates";

interface BrandTemplate {
  id: string;
  name: string;
  kind: "custom" | "preset";
  previewUrl: string | null;
}

type Provider = "opus" | "vizard";

export function OpusClipModal({
  fileId,
  file,
  canManage = false,
  onClose,
}: {
  fileId: string;
  file: FileItem;
  // Admin/editor can edit the template library (upload previews,
  // rename). Clients see the picker but not the upload affordance.
  canManage?: boolean;
  onClose: () => void;
}) {
  // Hidden: OpusClip provider for now. Vizard-only by user request.
  // Re-enable by flipping VIZARD_ONLY back to false (and showing the
  // tabs again below).
  const VIZARD_ONLY = true;
  const [provider, setProvider] = useState<Provider>(VIZARD_ONLY ? "vizard" : "opus");
  const [templates, setTemplates] = useState<BrandTemplate[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState<string>("");
  const [customTemplateId, setCustomTemplateId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ jobId: string; provider: Provider } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vizardTemplateId, setVizardTemplateId] = useState<string>("");
  const [vizardTemplates, setVizardTemplates] = useState<VizardTemplate[]>([]);
  // Lock-code state. When a client clicks a locked template, we prompt
  // for the 4-digit code; verifiedTemplates remembers which templates
  // already passed the check this session.
  const [pendingLockTemplate, setPendingLockTemplate] = useState<VizardTemplate | null>(null);
  const [lockCodeInput, setLockCodeInput] = useState("");
  const [lockError, setLockError] = useState<string | null>(null);
  const [verifyingLock, setVerifyingLock] = useState(false);
  const [verifiedTemplates, setVerifiedTemplates] = useState<Set<string>>(new Set());

  const verifyLockCode = async () => {
    if (!pendingLockTemplate) return;
    setVerifyingLock(true);
    setLockError(null);
    try {
      const res = await fetch("/api/vizard/templates/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: pendingLockTemplate.id,
          code: lockCodeInput,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { message?: string }).message ?? "Incorrect code.",
        );
      }
      setVerifiedTemplates((prev) => {
        const next = new Set(prev);
        next.add(pendingLockTemplate.id);
        return next;
      });
      setVizardTemplateId(pendingLockTemplate.id);
      setPendingLockTemplate(null);
      setLockCodeInput("");
    } catch (err) {
      setLockError((err as Error).message);
    } finally {
      setVerifyingLock(false);
    }
  };
  // Pull the merged template list (static config + DB overrides) so any
  // image uploaded via /admin/integrations/vizard shows up without a code
  // edit. Refetched whenever the modal opens.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/vizard/templates", { cache: "no-store" });
        if (!r.ok) return;
        const data = (await r.json()) as { templates: VizardTemplate[] };
        if (!cancelled) setVizardTemplates(data.templates);
      } catch {
        /* ignore — picker just won't show anything */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
      if (provider === "opus") {
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
        setSubmitted({ jobId: body.jobId, provider: "opus" });
      } else {
        const res = await fetch("/api/vizard/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileId,
            templateId: vizardTemplateId || undefined,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
        }
        const body = (await res.json()) as { projectId: string };
        setSubmitted({ jobId: body.projectId, provider: "vizard" });
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    const isOpus = submitted.provider === "opus";
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
          <p className="text-[14px] mb-1">
            Clips submitted to {isOpus ? "OpusClip" : "Vizard"}
          </p>
          <p className="text-[12px] text-text-muted mb-4">
            Typical processing: {isOpus ? "8–15" : "10–30"} minutes. Clips
            auto-import to your Clips folder when ready.
          </p>
          <code className="block px-3 py-2 bg-bg-elev-2 border border-border rounded-[8px] text-[11px] text-text-dim mb-3">
            project {submitted.jobId}
          </code>
          {isOpus ? (
            <a
              href={`https://www.opus.pro/clip/${submitted.jobId}`}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-[12px] text-accent-2 underline mb-5"
            >
              View in OpusClip dashboard →
            </a>
          ) : (
            <a
              href={`https://app.vizard.ai/project/${submitted.jobId}`}
              target="_blank"
              rel="noreferrer"
              className="inline-block text-[12px] text-accent-2 underline mb-5"
            >
              View in Vizard dashboard →
            </a>
          )}
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
      title="Generate clips"
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
            disabled={
              submitting ||
              (provider === "opus" && !selectedTemplateId) ||
              (provider === "vizard" && false)
            }
            className="px-5 py-2.5 rounded-[10px] bg-[linear-gradient(135deg,#a855f7,#ec4899)] text-white text-[13px] font-medium disabled:opacity-60"
          >
            {submitting ? "Submitting…" : "Generate clips"}
          </button>
        </>
      }
    >
      {/* Provider picker — hidden in VIZARD_ONLY mode. */}
      {!VIZARD_ONLY ? (
        <div className="inline-flex border border-border rounded-[10px] overflow-hidden mb-5 text-[13px]">
          {(["opus", "vizard"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setProvider(p)}
              className={
                provider === p
                  ? "px-4 py-2 bg-bg-elev-3 text-text font-medium"
                  : "px-4 py-2 bg-bg-elev text-text-muted hover:text-text"
              }
            >
              {p === "opus" ? "OpusClip" : "Vizard"}
            </button>
          ))}
        </div>
      ) : null}

      {provider === "vizard" ? (
        <div>
          <p className="text-[12px] text-text-muted mb-4">
            Pick a Vizard template. Output is vertical 9:16, capped at 90s.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
            {vizardTemplates.map((t) => (
              <VizardTemplateCard
                key={t.id}
                template={t}
                selected={vizardTemplateId === t.id}
                canUpload={canManage}
                onSelect={() => {
                  // Locked templates need the 4-digit code first —
                  // unless the user already verified it this session,
                  // or they're admin/editor (server still verifies).
                  if (t.locked && !verifiedTemplates.has(t.id)) {
                    setPendingLockTemplate(t);
                    setLockCodeInput("");
                    setLockError(null);
                    return;
                  }
                  setVizardTemplateId(t.id);
                }}
                onPreviewUploaded={(url) => {
                  setVizardTemplates((prev) =>
                    prev.map((p) => (p.id === t.id ? { ...p, previewUrl: url } : p)),
                  );
                }}
              />
            ))}
          </div>
          {error ? (
            <div className="mt-4 p-3 rounded-[10px] bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-[12px] text-[#f87171]">
              {error}
            </div>
          ) : null}
          {pendingLockTemplate ? (
            <div
              onClick={() => {
                setPendingLockTemplate(null);
                setLockCodeInput("");
                setLockError(null);
              }}
              className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex sm:items-start sm:justify-center sm:p-6 sm:pt-24"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="bg-bg-elev border border-border rounded-xl w-full max-w-sm p-5 shadow-modal"
              >
                <h3 className="text-[16px] font-semibold mb-1">
                  🔒 {pendingLockTemplate.name}
                </h3>
                <p className="text-[12px] text-text-muted mb-4">
                  This template requires a 4-digit code. Ask your admin for it.
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  autoFocus
                  value={lockCodeInput}
                  onChange={(e) => {
                    setLockCodeInput(e.target.value.replace(/\D/g, "").slice(0, 4));
                    setLockError(null);
                  }}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter" && lockCodeInput.length === 4) {
                      e.preventDefault();
                      await verifyLockCode();
                    }
                  }}
                  placeholder="••••"
                  className="w-full px-4 py-3 bg-bg-elev-2 border border-border rounded-[10px] text-center text-[20px] tracking-[0.4em] font-mono"
                />
                {lockError ? (
                  <p className="text-[12px] text-danger mt-2">{lockError}</p>
                ) : null}
                <div className="flex items-center justify-end gap-2 mt-4">
                  <button
                    onClick={() => {
                      setPendingLockTemplate(null);
                      setLockCodeInput("");
                      setLockError(null);
                    }}
                    className="px-4 py-2 text-text-muted hover:text-text text-[13px]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={verifyLockCode}
                    disabled={verifyingLock || lockCodeInput.length !== 4}
                    className="px-4 py-2 rounded-[10px] bg-accent text-white text-[13px] disabled:opacity-50"
                  >
                    {verifyingLock ? "Checking…" : "Unlock"}
                  </button>
                </div>
              </div>
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
        </div>
      ) : (
      <>
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
      </>
      )}
    </Modal>
  );
}

// Card with selection + an in-card "Upload preview" affordance — same
// pattern as the OpusClip side (hover-only icon button, top-right
// corner). Outer wrapper is a div so we don't nest a button inside a
// button (invalid HTML).
function VizardTemplateCard({
  template,
  selected,
  canUpload,
  onSelect,
  onPreviewUploaded,
}: {
  template: VizardTemplate;
  selected: boolean;
  canUpload: boolean;
  onSelect: () => void;
  onPreviewUploaded: (url: string) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  async function upload(file: File) {
    setUploading(true);
    setUploadErr(null);
    try {
      // Shrink BEFORE sending so we don't hit Vercel's 4.5 MB JSON body
      // limit. Server-side sharp would do the final resize too but the
      // request must clear the gateway first.
      const { shrinkImageForUpload } = await import("@/lib/image-ops");
      const { base64 } = await shrinkImageForUpload(file, 1400, 0.85);
      const res = await fetch("/api/admin/vizard-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: template.id, imageBase64: base64 }),
      });
      // Some Vercel error responses (413, SSO redirects, etc) are HTML
      // not JSON — read as text and try to parse so we can surface the
      // real reason instead of "Unexpected token <".
      const text = await res.text();
      let data: { message?: string; previewUrl?: string | null } = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        /* leave data empty — surface text below */
      }
      if (!res.ok) {
        const msg =
          data.message ||
          (res.status === 413
            ? "Image too large — try a smaller file."
            : res.status === 403
              ? "Admin/editor only — sign in as one to upload previews."
              : `Upload failed (${res.status})`);
        throw new Error(msg);
      }
      if (data.previewUrl) {
        onPreviewUploaded(`${data.previewUrl}&t=${Date.now()}`);
      }
    } catch (err) {
      setUploadErr((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      className={`group relative rounded-[10px] border-2 overflow-hidden transition cursor-pointer ${
        selected
          ? "border-[rgba(236,72,153,0.7)] bg-[rgba(236,72,153,0.08)]"
          : "border-border bg-bg-elev-2 hover:border-border-strong"
      }`}
      onClick={onSelect}
    >
      <VizardTemplatePreview template={template} />
      {template.locked ? (
        <span
          className="absolute top-1.5 left-1.5 w-7 h-7 rounded-full bg-bg/90 backdrop-blur border border-border-strong shadow-lg flex items-center justify-center text-[#fbbf24]"
          title="Locked — requires 4-digit code"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </span>
      ) : null}
      <div className="px-2 py-1.5">
        <div className="text-[12px] font-medium truncate flex items-center gap-1">
          {template.locked ? <span className="text-[#fbbf24] text-[10px] shrink-0">🔒</span> : null}
          <span className="truncate">{template.name}</span>
        </div>
        <div className="text-[10px] text-text-dim truncate">{template.id}</div>
      </div>

      {/* Always show — server-side check enforces the real "admin/editor
          only" rule, and the in-card affordance is cleaner than gating
          the button. Unauthorized clicks see "Admin/editor only — sign
          in as one to upload previews." */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          fileInputRef.current?.click();
        }}
        disabled={uploading}
        title={canUpload ? "Upload preview image" : "Admin/editor only — sign in as one to upload"}
        className="absolute top-1.5 right-1.5 w-8 h-8 rounded-full bg-bg/90 backdrop-blur border border-border-strong shadow-lg flex items-center justify-center text-text hover:text-accent transition"
      >
        {uploading ? (
          <span className="text-[10px]">…</span>
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
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }}
        onClick={(e) => e.stopPropagation()}
      />

      {uploadErr ? (
        <div className="absolute inset-x-1 bottom-1 px-2 py-1 rounded bg-[rgba(239,68,68,0.9)] text-white text-[10px] truncate">
          {uploadErr}
        </div>
      ) : null}
    </div>
  );
}

// Preview tile for a Vizard template. Tries explicit `previewUrl` first,
// then a convention path (`/vizard-templates/{id}.jpg` then `.png`), then
// falls back to a "No preview" placeholder. Lets the operator drop an
// image into `app/public/vizard-templates/{id}.jpg` and have it Just
// Work without touching code.
function VizardTemplatePreview({ template }: { template: VizardTemplate }) {
  const candidates: string[] = [];
  if (template.previewUrl) candidates.push(template.previewUrl);
  candidates.push(`/vizard-templates/${template.id}.jpg`);
  candidates.push(`/vizard-templates/${template.id}.png`);
  const [idx, setIdx] = useState(0);
  if (idx >= candidates.length) {
    return (
      <div className="aspect-[9/16] bg-bg-elev-3 flex items-center justify-center text-text-dim text-[10px] px-2 text-center">
        No preview
      </div>
    );
  }
  const src = candidates[idx];
  if (/\.(mp4|webm)$/i.test(src)) {
    return (
      <div className="aspect-[9/16] bg-black overflow-hidden">
        <video
          src={src}
          muted
          loop
          autoPlay
          playsInline
          onError={() => setIdx((i) => i + 1)}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }
  return (
    <div className="aspect-[9/16] bg-black overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={template.name}
        onError={() => setIdx((i) => i + 1)}
        loading="lazy"
        className="w-full h-full object-cover"
      />
    </div>
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
