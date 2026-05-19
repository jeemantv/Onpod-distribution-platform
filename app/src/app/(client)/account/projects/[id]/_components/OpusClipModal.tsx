"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import type { FileItem } from "@/lib/types";

const STYLES = [
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
  void fileId;
  const [style, setStyle] = useState("onpod-bold");
  const [aspect, setAspect] = useState<"9:16" | "1:1" | "16:9">("9:16");
  const [count, setCount] = useState<string>("auto");
  const [duration, setDuration] = useState<string>("30-60");
  const [branding, setBranding] = useState<string>("onpod-default");
  const [submitting, setSubmitting] = useState(false);

  const submit = () => {
    setSubmitting(true);
    setTimeout(() => {
      setSubmitting(false);
      onClose();
    }, 900);
  };

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
              onClick={() => setStyle(s.id)}
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
          <select value={duration} onChange={(e) => setDuration(e.target.value)} className="input-op">
            <option value="15-30">15–30s</option>
            <option value="30-60">30–60s</option>
            <option value="60-90">60–90s</option>
          </select>
        </Section>
        <Section title="Branding">
          <select value={branding} onChange={(e) => setBranding(e.target.value)} className="input-op">
            <option value="onpod-default">OnPod default</option>
            <option value="none">No branding</option>
            <option value="custom">Custom logo</option>
          </select>
        </Section>
      </div>

      <div className="mt-5 p-3 rounded-[10px] bg-bg-elev-2 border border-border text-[12px] text-text-muted">
        Cost: <span className="text-text">1 OpusClip credit</span> from your monthly allowance.
      </div>

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
