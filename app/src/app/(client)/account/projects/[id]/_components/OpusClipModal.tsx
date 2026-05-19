"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import type { FileItem } from "@/lib/types";

const STYLES: { id: "onpod-bold" | "minimal" | "viral"; name: string; description: string }[] = [
  { id: "onpod-bold", name: "OnPod Bold", description: "High-contrast, animated word highlights" },
  { id: "minimal", name: "Minimal", description: "Subtle captions, speaker focus" },
  { id: "viral", name: "Viral Hook", description: "Hook-first, emoji captions, fast cuts" },
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
  const [style, setStyle] = useState<"onpod-bold" | "minimal" | "viral">("onpod-bold");
  const [aspect, setAspect] = useState<"9:16" | "1:1" | "16:9">("9:16");
  const [count, setCount] = useState<string>("auto");
  const [duration, setDuration] = useState<"15-30" | "30-60" | "60-90">("30-60");
  const [branding, setBranding] = useState<"onpod-default" | "none" | "custom">("onpod-default");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<{ jobId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/opus/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId,
          styleTemplateId: style,
          aspectRatio: aspect,
          count: count === "auto" ? "auto" : Number(count),
          durationRange: duration,
          branding,
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
            Typical processing: 8–15 minutes. We&apos;ll save the clips into your project&apos;s Clips folder automatically.
          </p>
          <code className="block px-3 py-2 bg-bg-elev-2 border border-border rounded-[8px] text-[11px] text-text-dim mb-5">
            job {submitted.jobId}
          </code>
          <button onClick={onClose} className="px-4 py-2 rounded-[8px] bg-bg-elev-3 border border-border-strong text-[13px]">
            Close
          </button>
        </div>
      </Modal>
    );
  }

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
            disabled={submitting}
            className="px-5 py-2.5 rounded-[10px] bg-[linear-gradient(135deg,#a855f7,#ec4899)] text-white text-[13px] font-medium disabled:opacity-60"
          >
            {submitting ? "Submitting…" : "Generate clips"}
          </button>
        </>
      }
    >
      <p className="text-[12px] text-text-muted mb-5">
        OpusClip will analyze your video and generate short-form clips with captions. Typical processing: 8–15 minutes. You&apos;ll get an email when ready.
      </p>

      <Section title="Style">
        <div className="grid grid-cols-3 gap-3">
          {STYLES.map((s) => (
            <button
              key={s.id}
              onClick={() => setStyle(s.id as typeof style)}
              className={`text-left p-3 rounded-[10px] border transition ${
                style === s.id
                  ? "border-[rgba(236,72,153,0.5)] bg-[rgba(236,72,153,0.08)]"
                  : "border-border bg-bg-elev-2 hover:border-border-strong"
              }`}
            >
              <div className="display text-[16px] mb-1">{s.name}</div>
              <div className="text-[11px] text-text-muted">{s.description}</div>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Aspect ratio">
        <div className="flex bg-bg-elev-2 border border-border rounded-[10px] p-1 w-fit">
          {(["9:16", "1:1", "16:9"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setAspect(r)}
              className={`px-4 py-1.5 rounded-[6px] text-[12px] ${
                aspect === r ? "bg-bg-elev-3 text-text" : "text-text-muted"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </Section>

      <div className="grid grid-cols-3 gap-4">
        <Section title="Number of clips">
          <select value={count} onChange={(e) => setCount(e.target.value)} className="input-op">
            <option value="auto">Auto (5–10)</option>
            <option value="3">3</option>
            <option value="5">5</option>
            <option value="10">10</option>
            <option value="15">15</option>
          </select>
        </Section>
        <Section title="Clip duration">
          <select value={duration} onChange={(e) => setDuration(e.target.value as typeof duration)} className="input-op">
            <option value="15-30">15–30s</option>
            <option value="30-60">30–60s</option>
            <option value="60-90">60–90s</option>
          </select>
        </Section>
        <Section title="Branding">
          <select value={branding} onChange={(e) => setBranding(e.target.value as typeof branding)} className="input-op">
            <option value="onpod-default">OnPod default</option>
            <option value="none">No branding</option>
            <option value="custom">Custom logo</option>
          </select>
        </Section>
      </div>

      <div className="mt-5 p-3 rounded-[10px] bg-bg-elev-2 border border-border text-[12px] text-text-muted">
        Cost: <span className="text-text">1 OpusClip credit</span> from your monthly allowance.
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
