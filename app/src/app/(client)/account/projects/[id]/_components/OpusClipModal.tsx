"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import type { FileItem } from "@/lib/types";

interface BrandTemplate {
  id: string;
  name: string;
}

const DURATION_OPTIONS = [
  { value: "0-29" as const, label: "Under 30s", range: [0, 29] as [number, number] },
  { value: "30-59" as const, label: "30–59s", range: [30, 59] as [number, number] },
  { value: "60-89" as const, label: "60–89s", range: [60, 89] as [number, number] },
];

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
  const [duration, setDuration] = useState<typeof DURATION_OPTIONS[number]["value"]>("30-59");
  const [count, setCount] = useState<string>("auto");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ jobId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/opus/brand-templates");
      if (!res.ok) return;
      const body = (await res.json()) as { templates: BrandTemplate[] };
      setTemplates(body.templates);
      if (body.templates.length > 0) setActiveTemplateId(body.templates[0].id);
    })();
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
          count: count === "auto" ? "auto" : Number(count),
          durationRange: duration,
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

  const fallbackTemplate = templates.length === 0;

  return (
    <Modal
      title="Generate clips with OpusClip"
      subtitle={file.name}
      onClose={onClose}
      size="lg"
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
        OpusClip generates short-form clips using your brand template. Always vertical (9:16). Clips auto-download to this project&apos;s Clips folder when ready.
      </p>

      <Section title="Brand template">
        {fallbackTemplate ? (
          <div className="p-3 rounded-[10px] bg-[rgba(245,158,11,0.08)] border border-[rgba(245,158,11,0.25)] text-[12px] text-[#fbbf24]">
            OpusClip&apos;s brand-templates list endpoint returns empty for this account. Paste a template ID below — find it in opus.pro → Brand templates → your template → URL has the ID.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setActiveTemplateId(t.id);
                  setCustomTemplateId("");
                }}
                className={`text-left p-3 rounded-[10px] border transition ${
                  activeTemplateId === t.id && !customTemplateId.trim()
                    ? "border-[rgba(236,72,153,0.5)] bg-[rgba(236,72,153,0.08)]"
                    : "border-border bg-bg-elev-2 hover:border-border-strong"
                }`}
              >
                <div className="text-[13px] font-medium">{t.name}</div>
                <div className="text-[11px] text-text-dim mt-0.5 truncate">{t.id}</div>
              </button>
            ))}
          </div>
        )}
        <div className="mt-3">
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
      </Section>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Section title="Clip duration">
          <div className="flex bg-bg-elev-2 border border-border rounded-[10px] p-1">
            {DURATION_OPTIONS.map((d) => (
              <button
                key={d.value}
                onClick={() => setDuration(d.value)}
                className={`flex-1 py-1.5 text-[12px] rounded-[6px] ${
                  duration === d.value ? "bg-bg-elev-3 text-text" : "text-text-muted"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </Section>
        <Section title="Number of clips">
          <select value={count} onChange={(e) => setCount(e.target.value)} className="input-op">
            <option value="auto">Auto (5–10)</option>
            <option value="3">3</option>
            <option value="5">5</option>
            <option value="10">10</option>
            <option value="15">15</option>
          </select>
        </Section>
      </div>

      <div className="mt-5 p-3 rounded-[10px] bg-bg-elev-2 border border-border text-[12px] text-text-muted">
        <span className="text-text">Format:</span> always vertical 9:16. No hook overlay.{" "}
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="text-[12px] text-text-muted mb-2">{title}</div>
      {children}
    </div>
  );
}
