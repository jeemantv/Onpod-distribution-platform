"use client";

import { useMemo, useState } from "react";
import type { FileItem, FileType } from "@/lib/types";
import { formatBytes } from "@/lib/format";
import { FileActionButtons } from "./FileActionButtons";
import { ApprovalToggle } from "./ApprovalToggle";
import { FileStatusBadges } from "./FileStatusBadges";
import { AIStudioModal } from "./AIStudioModal";
import { YouTubeModal } from "./YouTubeModal";
import { SpotifyModal } from "./SpotifyModal";
import { OpusClipModal } from "./OpusClipModal";
import { RequestApprovalModal } from "./RequestApprovalModal";
import { UploadButton } from "./UploadButton";
import { PreviewModal } from "./PreviewModal";

const TABS: { key: FileType | "ai"; label: string }[] = [
  { key: "raw", label: "Raw Files" },
  { key: "edited", label: "Edited Podcast" },
  { key: "clip", label: "Clips" },
  { key: "asset", label: "Assets" },
  { key: "ai", label: "AI Content" },
];

export function FilePortal({
  projectId,
  files: initialFiles,
  aiReadyByFile,
  shareToken,
}: {
  projectId: string;
  files: FileItem[];
  aiReadyByFile: Record<string, boolean>;
  shareToken: string;
}) {
  const [activeTab, setActiveTab] = useState<FileType | "ai">("edited");
  const [files, setFiles] = useState<FileItem[]>(initialFiles);
  const [search, setSearch] = useState("");
  const [aiReady, setAiReady] = useState(aiReadyByFile);
  const [aiProgress, setAiProgress] = useState<Record<string, number>>({});

  const [modal, setModal] = useState<
    | null
    | { kind: "ai" | "youtube" | "spotify" | "opus" | "preview"; fileId: string }
    | { kind: "request-approval" }
  >(null);

  const filtered = useMemo(() => {
    if (activeTab === "ai") {
      return files.filter((f) => aiReady[f.id]);
    }
    const byType = files.filter((f) => f.type === activeTab);
    if (!search.trim()) return byType;
    const q = search.toLowerCase();
    return byType.filter((f) => f.name.toLowerCase().includes(q));
  }, [files, activeTab, search, aiReady]);

  const counts: Record<FileType | "ai", number> = {
    raw: files.filter((f) => f.type === "raw").length,
    edited: files.filter((f) => f.type === "edited").length,
    clip: files.filter((f) => f.type === "clip").length,
    asset: files.filter((f) => f.type === "asset").length,
    ai: Object.values(aiReady).filter(Boolean).length,
  };

  const updateApproval = (fileId: string, next: FileItem["approvalStatus"]) => {
    setFiles((fs) =>
      fs.map((f) => (f.id === fileId ? { ...f, approvalStatus: next } : f)),
    );
  };

  const downloadFile = async (fileId: string, filename: string) => {
    try {
      const res = await fetch(`/api/files/${fileId}/download`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { signedUrl } = (await res.json()) as { signedUrl: string };
      const a = document.createElement("a");
      a.href = signedUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      alert(
        "Download failed: " + (e instanceof Error ? e.message : String(e)),
      );
    }
  };

  const startAI = (fileId: string) => {
    if (aiReady[fileId]) {
      setModal({ kind: "ai", fileId });
      return;
    }
    if (aiProgress[fileId] !== undefined) return;
    setAiProgress((p) => ({ ...p, [fileId]: 1 }));
    const tick = () => {
      setAiProgress((p) => {
        const cur = p[fileId] ?? 0;
        const next = cur + Math.floor(Math.random() * 12) + 6;
        if (next >= 100) {
          setAiReady((r) => ({ ...r, [fileId]: true }));
          const { [fileId]: _gone, ...rest } = p;
          void _gone;
          return rest;
        }
        setTimeout(tick, 700);
        return { ...p, [fileId]: next };
      });
    };
    setTimeout(tick, 600);
  };

  return (
    <>
      <div className="flex items-center gap-2 mb-5 bg-bg-elev border border-border rounded-[12px] p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2 rounded-[8px] text-[13px] font-medium flex items-center gap-2 transition ${
              activeTab === t.key
                ? "bg-bg-elev-3 text-text"
                : "text-text-muted hover:text-text"
            }`}
          >
            {t.label}
            <span
              className={`text-[11px] px-[7px] py-[2px] rounded-full ${
                activeTab === t.key
                  ? "bg-accent text-white"
                  : "bg-[rgba(255,255,255,0.08)]"
              }`}
            >
              {counts[t.key]}
            </span>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
        <div className="relative flex-1 max-w-[360px]">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files…"
            className="w-full pl-10 pr-3 py-2.5 bg-bg-elev border border-border rounded-[12px] text-[13px] focus:outline-none focus:border-border-strong"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setModal({ kind: "request-approval" })}
            className="px-3.5 py-2 rounded-[8px] bg-bg-elev border border-border hover:border-border-strong text-[13px]"
          >
            Request approval
          </button>
          <button className="px-3.5 py-2 rounded-[8px] bg-bg-elev border border-border hover:border-border-strong text-[13px]">
            Download all
          </button>
          <UploadButton projectId={projectId} />
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {filtered.length === 0 ? (
          <li className="bg-bg-elev border border-border rounded-lg px-5 py-10 text-center text-text-muted text-[13px]">
            No files in this folder yet.
          </li>
        ) : (
          filtered.map((f) => (
            <li
              key={f.id}
              className={`flex items-center gap-4 px-5 py-4 border rounded-lg transition ${rowStyle(f)}`}
            >
              <input
                type="checkbox"
                className="accent-accent w-4 h-4 shrink-0"
                aria-label={`Select ${f.name}`}
              />
              <FileIcon mime={f.mimeType} />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-[14px] truncate">{f.name}</div>
                <div className="text-[12px] text-text-muted mt-1 flex items-center gap-2 flex-wrap">
                  <span>{formatBytes(f.sizeBytes)}</span>
                  <span>·</span>
                  <span>Updated May 12, 2026</span>
                  <FileStatusBadges file={f} />
                </div>
              </div>

              {needsApproval(f) ? (
                <ApprovalToggle
                  value={f.approvalStatus}
                  onChange={(next) => updateApproval(f.id, next)}
                />
              ) : null}

              <FileActionButtons
                file={f}
                aiReady={!!aiReady[f.id]}
                aiProgress={aiProgress[f.id]}
                onAI={() => startAI(f.id)}
                onYouTube={() => setModal({ kind: "youtube", fileId: f.id })}
                onSpotify={() => setModal({ kind: "spotify", fileId: f.id })}
                onOpus={() => setModal({ kind: "opus", fileId: f.id })}
                onPreview={() => setModal({ kind: "preview", fileId: f.id })}
                onDownload={() => downloadFile(f.id, f.name)}
              />
            </li>
          ))
        )}
      </ul>

      {modal?.kind === "ai" ? (
        <AIStudioModal
          fileId={modal.fileId}
          file={files.find((f) => f.id === modal.fileId)!}
          onClose={() => setModal(null)}
        />
      ) : null}
      {modal?.kind === "youtube" ? (
        <YouTubeModal
          fileId={modal.fileId}
          file={files.find((f) => f.id === modal.fileId)!}
          aiReady={!!aiReady[modal.fileId]}
          onClose={() => setModal(null)}
        />
      ) : null}
      {modal?.kind === "spotify" ? (
        <SpotifyModal
          fileId={modal.fileId}
          file={files.find((f) => f.id === modal.fileId)!}
          aiReady={!!aiReady[modal.fileId]}
          onClose={() => setModal(null)}
        />
      ) : null}
      {modal?.kind === "opus" ? (
        <OpusClipModal
          fileId={modal.fileId}
          file={files.find((f) => f.id === modal.fileId)!}
          onClose={() => setModal(null)}
        />
      ) : null}
      {modal?.kind === "preview" ? (
        <PreviewModal
          file={files.find((f) => f.id === modal.fileId)!}
          onClose={() => setModal(null)}
        />
      ) : null}
      {modal?.kind === "request-approval" ? (
        <RequestApprovalModal
          projectId={projectId}
          shareToken={shareToken}
          unapprovedFiles={files.filter(
            (f) => needsApproval(f) && f.approvalStatus === "none",
          )}
          onClose={() => setModal(null)}
          onSent={() => {
            setFiles((fs) =>
              fs.map((f) =>
                needsApproval(f) && f.approvalStatus === "none"
                  ? { ...f, approvalStatus: "pending" }
                  : f,
              ),
            );
            setModal(null);
          }}
        />
      ) : null}
    </>
  );
}

function needsApproval(f: FileItem): boolean {
  return f.type === "edited" || f.type === "clip";
}

function rowStyle(f: FileItem): string {
  const published = f.publishStates.some((s) => s.action === "published");
  const scheduled = f.publishStates.some((s) => s.action === "scheduled");
  if (published)
    return "bg-[rgba(59,130,246,0.06)] border-[rgba(59,130,246,0.25)] hover:bg-[rgba(59,130,246,0.10)]";
  if (scheduled)
    return "bg-[rgba(245,158,11,0.05)] border-[rgba(245,158,11,0.22)] hover:bg-[rgba(245,158,11,0.09)]";
  if (f.approvalStatus === "approved")
    return "bg-[rgba(16,185,129,0.05)] border-[rgba(16,185,129,0.22)] hover:bg-[rgba(16,185,129,0.09)]";
  return "bg-bg-elev border-border hover:bg-bg-elev-2 hover:border-border-strong";
}

function FileIcon({ mime }: { mime: string }) {
  const kind = mime.startsWith("video/")
    ? "video"
    : mime.startsWith("audio/")
      ? "audio"
      : mime.startsWith("image/")
        ? "image"
        : "file";
  const stroke = "currentColor";
  return (
    <div className="w-11 h-11 rounded-md bg-bg-elev-3 flex items-center justify-center text-text-muted shrink-0">
      {kind === "video" ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2">
          <polygon points="23 7 16 12 23 17 23 7" />
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
        </svg>
      ) : kind === "audio" ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2">
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      ) : kind === "image" ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      )}
    </div>
  );
}
