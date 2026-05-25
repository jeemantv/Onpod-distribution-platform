"use client";

import type { FileItem } from "@/lib/types";
import { canUse } from "@/lib/plan-gate";

export function FileActionButtons({
  file,
  aiReady,
  aiProgress,
  plan,
  role,
  onAI,
  onYouTube,
  onSpotify,
  onOpus,
  onPreview,
  onDownload,
}: {
  file: FileItem;
  aiReady: boolean;
  aiProgress?: number;
  plan?: string;
  role?: string;
  onAI: () => void;
  onYouTube: () => void;
  onSpotify: () => void;
  onOpus: () => void;
  onPreview: () => void;
  onDownload: () => void;
}) {
  const isVideo = file.mimeType.startsWith("video/");
  const needsApproval = file.type === "edited" || file.type === "clip";
  const approvalGated = needsApproval && file.approvalStatus !== "approved";
  // Admin + editor bypass plan gates (testing, content prep).
  const bypass = role === "admin" || role === "editor";
  const p = plan ?? "free";
  const planGatedAI = !bypass && !canUse(p, "ai");
  const planGatedYouTube = !bypass && !canUse(p, "youtube");
  const planGatedSpotify = !bypass && !canUse(p, "spotify");
  const planGatedClips = !bypass && !canUse(p, "clips");
  const showSpotify = file.type !== "clip" && file.type !== "asset" && isVideo;
  const showOpus = file.type !== "clip" && file.type !== "asset" && isVideo;
  const showYouTube = isVideo && file.type !== "raw" && file.type !== "asset";
  const showAI = isVideo && file.type !== "asset";

  return (
    <div className="flex items-center gap-1 shrink-0">
      {showAI ? (
        <AIActionBtn
          onClick={onAI}
          ready={aiReady}
          progress={aiProgress}
          planGated={planGatedAI}
        />
      ) : (
        <Spacer />
      )}

      {showYouTube ? (
        <ActionBtn
          label="YouTube"
          onClick={onYouTube}
          tint="red"
          gated={approvalGated}
          planGated={planGatedYouTube}
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58 2.78 2.78 0 0 0 1.94 2C5.12 20 12 20 12 20s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58zM9.75 15.5v-7L15.5 12z" />
            </svg>
          }
        />
      ) : (
        <Spacer />
      )}

      {showSpotify ? (
        <ActionBtn
          label="Spotify"
          onClick={onSpotify}
          tint="green"
          gated={approvalGated}
          planGated={planGatedSpotify}
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm4.5 14.4a.6.6 0 0 1-.84.21c-2.3-1.4-5.2-1.72-8.6-.93a.6.6 0 1 1-.27-1.18c3.71-.85 6.92-.49 9.5 1.07a.6.6 0 0 1 .21.83zm1.2-2.66a.75.75 0 0 1-1.05.27c-2.64-1.62-6.66-2.09-9.78-1.14a.75.75 0 1 1-.44-1.43c3.56-1.09 8-.56 11.04 1.27a.75.75 0 0 1 .23 1.03zm.1-2.78c-3.15-1.87-8.35-2.04-11.36-1.13a.9.9 0 1 1-.52-1.72c3.46-1.05 9.21-.84 12.84 1.31a.9.9 0 1 1-.96 1.54z" />
            </svg>
          }
        />
      ) : (
        <Spacer />
      )}

      {showOpus ? (
        <ActionBtn
          label="Clips"
          onClick={onOpus}
          tint="gradient"
          gated={approvalGated}
          planGated={planGatedClips}
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="6" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <line x1="20" y1="4" x2="8.12" y2="15.88" />
              <line x1="14.47" y1="14.48" x2="20" y2="20" />
              <line x1="8.12" y1="8.12" x2="12" y2="12" />
            </svg>
          }
        />
      ) : (
        <Spacer />
      )}

      <div className="w-px h-5 bg-border mx-1 hidden sm:block" />

      <button
        aria-label="Preview"
        onClick={onPreview}
        className="w-11 h-11 sm:w-8 sm:h-8 rounded-md bg-bg-elev-2 border border-border hover:border-border-strong text-text-muted hover:text-text flex items-center justify-center"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>
      <button
        aria-label="Download"
        onClick={onDownload}
        className={`w-11 h-11 sm:w-8 sm:h-8 rounded-md border flex items-center justify-center ${
          file.downloadCount > 0
            ? "bg-[rgba(16,185,129,0.12)] border-[rgba(16,185,129,0.3)] text-[#34d399]"
            : "bg-bg-elev-2 border-border hover:border-border-strong text-text-muted hover:text-text"
        }`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </button>
    </div>
  );
}

// Invisible 32px slot on sm+; collapses on mobile so cramped rows aren't bloated.
function Spacer() {
  return <div className="hidden sm:block w-8 h-8 shrink-0" aria-hidden="true" />;
}

function ActionBtn({
  label,
  icon,
  onClick,
  ready,
  progress,
  gated,
  planGated,
  tint,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  ready?: boolean;
  progress?: number;
  gated?: boolean;
  planGated?: boolean;
  tint: "purple" | "red" | "green" | "gradient";
}) {
  const baseTint =
    tint === "purple"
      ? "bg-[rgba(168,85,247,0.12)] text-[#c084fc] border-[rgba(168,85,247,0.25)] hover:bg-[rgba(168,85,247,0.18)]"
      : tint === "red"
        ? "bg-[rgba(239,68,68,0.12)] text-[#f87171] border-[rgba(239,68,68,0.25)] hover:bg-[rgba(239,68,68,0.18)]"
        : tint === "green"
          ? "bg-[rgba(16,185,129,0.12)] text-[#34d399] border-[rgba(16,185,129,0.25)] hover:bg-[rgba(16,185,129,0.18)]"
          : "bg-[linear-gradient(135deg,rgba(168,85,247,0.18),rgba(236,72,153,0.18))] text-[#f0abfc] border-[rgba(236,72,153,0.3)] hover:opacity-90";

  const visuallyGated = gated || planGated;
  const gatedCls = visuallyGated ? "opacity-35 cursor-not-allowed hover:opacity-35" : "";
  const reason = planGated
    ? `${label} isn't included in your plan. Upgrade in /settings/billing.`
    : gated
      ? "Awaiting client approval before publishing. Click the Approve toggle on this row first."
      : label;

  return (
    <button
      onClick={(e) => {
        if (planGated) {
          e.preventDefault();
          if (confirm(`${label} requires a paid plan. Go to billing to upgrade?`)) {
            window.location.href = "/settings/billing";
          }
          return;
        }
        if (gated) {
          e.preventDefault();
          alert(reason);
          return;
        }
        onClick();
      }}
      title={reason}
      aria-label={label}
      className={`relative w-11 h-11 sm:w-8 sm:h-8 rounded-md border flex items-center justify-center transition shrink-0 ${baseTint} ${gatedCls}`}
    >
      {icon}
      {ready ? (
        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-success border-2 border-bg" />
      ) : null}
      {planGated ? (
        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-bg flex items-center justify-center" title="Upgrade required">
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-text-muted">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </span>
      ) : null}
    </button>
  );
}

// Dedicated AI button — shows literal "AI" lettering with an SVG progress
// ring around it (replaces the percent text under the button). When the
// pipeline finishes, the green ready dot shows in the corner.
function AIActionBtn({
  onClick,
  ready,
  progress,
  planGated,
}: {
  onClick: () => void;
  ready?: boolean;
  progress?: number;
  planGated?: boolean;
}) {
  const tint =
    "bg-[rgba(168,85,247,0.12)] text-[#c084fc] border-[rgba(168,85,247,0.25)] hover:bg-[rgba(168,85,247,0.18)]";
  // SVG ring math: stroke a circle and animate dashoffset against the
  // full circumference.
  const size = 36;
  const stroke = 2.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = typeof progress === "number" ? Math.max(0, Math.min(100, progress)) : null;
  const dashoffset = pct !== null ? circumference * (1 - pct / 100) : 0;

  return (
    <button
      onClick={(e) => {
        if (planGated) {
          e.preventDefault();
          if (confirm("AI requires a paid plan. Go to billing to upgrade?")) {
            window.location.href = "/settings/billing";
            return;
          }
          return;
        }
        onClick();
      }}
      title={
        planGated
          ? "AI isn't included in your plan. Upgrade in /settings/billing."
          : pct !== null
            ? `AI — ${pct}%`
            : "AI"
      }
      aria-label="AI"
      className={`relative w-11 h-11 sm:w-8 sm:h-8 rounded-md border flex items-center justify-center transition shrink-0 ${tint} ${planGated ? "opacity-35 cursor-not-allowed hover:opacity-35" : ""}`}
    >
      {pct !== null ? (
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="absolute inset-0 -rotate-90"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.2}
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={dashoffset}
            strokeLinecap="round"
          />
        </svg>
      ) : null}
      <span className="font-semibold tracking-tight text-[11px] leading-none">AI</span>
      {ready ? (
        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-success border-2 border-bg" />
      ) : null}
      {planGated ? (
        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-bg flex items-center justify-center" title="Upgrade required">
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-text-muted">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </span>
      ) : null}
    </button>
  );
}
