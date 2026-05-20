"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { FileItem, FileType } from "@/lib/types";
import { formatBytes } from "@/lib/format";
import { FileActionButtons } from "./FileActionButtons";
import { ApprovalToggle } from "./ApprovalToggle";
import { FileStatusBadges } from "./FileStatusBadges";
import { VersionMenu } from "@/components/VersionMenu";
import { AIStudioModal } from "./AIStudioModal";
import { YouTubeModal, type PublishedInfo as YTPublishedInfo } from "./YouTubeModal";
import { uploadToYouTube, type UploadProgress } from "@/lib/yt-uploader";
import { SpotifyModal } from "./SpotifyModal";
import { OpusClipModal } from "./OpusClipModal";
import { RequestApprovalModal } from "./RequestApprovalModal";
import { UploadButton } from "./UploadButton";
import { PreviewModal } from "./PreviewModal";
import { FileContextMenu } from "./FileContextMenu";

const TABS: { key: FileType; label: string }[] = [
  { key: "raw", label: "Raw Files" },
  { key: "edited", label: "Edited Podcast" },
  { key: "clip", label: "Clips" },
  { key: "asset", label: "Assets" },
];

export function FilePortal({
  projectId,
  files: initialFiles,
  aiReadyByFile,
  shareToken,
  studioContext,
  currentUserEmail = "",
  canMarkDone = false,
}: {
  projectId: string;
  files: FileItem[];
  aiReadyByFile: Record<string, boolean>;
  shareToken: string;
  studioContext?: {
    studio: string;
    bucket: string;
    folder: string;
  };
  // Passed down to PreviewModal so the embedded VideoReviewer knows
  // who's logged in and whether they can mark notes done.
  currentUserEmail?: string;
  canMarkDone?: boolean;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<FileType>("edited");
  const [files, setFiles] = useState<FileItem[]>(initialFiles);
  const [search, setSearch] = useState("");
  const [aiReady, setAiReady] = useState(aiReadyByFile);
  const [aiProgress, setAiProgress] = useState<Record<string, number>>({});
  // Per-file flag: true when there's at least one open revision note.
  // Hydrated lazily on mount; null until first check, then boolean.
  const [revisionByFile, setRevisionByFile] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<string, boolean> = {};
      for (const f of files) {
        if (!/\.(mp4|mov|webm)$/i.test(f.name)) continue;
        try {
          const r = await fetch(`/api/revisions/${f.id}`, { cache: "no-store" });
          if (!r.ok) continue;
          const data = await r.json();
          const open = (data.revisions?.notes ?? []).filter(
            (n: { status: string }) => n.status === "open",
          ).length;
          if (open > 0) next[f.id] = true;
        } catch {
          /* ignore */
        }
        if (cancelled) return;
      }
      if (!cancelled) setRevisionByFile(next);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [toast, setToast] = useState<{
    kind: "success" | "error" | "progress";
    title: string;
    detail?: string;
    href?: string;
    percent?: number;
    sticky?: boolean;
  } | null>(null);

  useEffect(() => {
    if (!toast || toast.sticky) return;
    const t = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(t);
  }, [toast]);

  const runYouTubeUpload = async (info: YTPublishedInfo) => {
    const controller = new AbortController();
    setToast({
      kind: "progress",
      title: "Uploading to YouTube…",
      detail: info.title,
      percent: 0,
      sticky: true,
    });
    try {
      console.log("[runYT] starting upload", {
        sizeBytes: info.init.sizeBytes,
        title: info.init.title,
        vidType: info.init.vidType,
      });
      const { videoId } = await uploadToYouTube(
        info.init,
        controller.signal,
        (p: UploadProgress) => {
          const percent = Math.round((p.uploaded / Math.max(1, p.total)) * 100);
          setToast({
            kind: "progress",
            title:
              p.phase === "fetching"
                ? "Fetching from B2…"
                : p.phase === "uploading"
                  ? `Uploading to YouTube… ${percent}%`
                  : p.phase === "finalizing"
                    ? "Finalizing on YouTube…"
                    : "Working…",
            detail: info.title,
            percent,
            sticky: true,
          });
        },
      );
      console.log("[runYT] uploadToYouTube returned videoId=", videoId);
      const url = `https://www.youtube.com/watch?v=${videoId}`;
      // Finalize on server side: record history, set thumbnail, add playlist.
      // If this fails (Vercel timeout, YouTube rejected thumbnail size, etc)
      // the video is already up on YouTube — show a partial-success toast
      // instead of pretending the whole publish failed.
      let finalizeErr: string | null = null;
      let finalizeResult: Record<string, unknown> = {};
      try {
        const finRes = await fetch("/api/youtube/upload-complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileId: info.fileId,
            videoId,
            title: info.title,
            vidType: info.init.vidType,
            publishAt: info.init.publishAt,
            visibility: info.init.visibility,
            playlistId: info.playlistId,
            thumbnailUrl: info.thumbnailUrl,
            thumbnailBase64: info.thumbnailBase64,
          }),
        });
        if (!finRes.ok) {
          finalizeErr = `HTTP ${finRes.status}`;
        } else {
          finalizeResult = (await finRes.json()) as Record<string, unknown>;
        }
      } catch (err) {
        console.error("[runYT] upload-complete fetch threw", err);
        finalizeErr = (err as Error).message;
      }
      console.log("[runYT] finalize done", { finalizeErr, finalizeResult });

      const thumbProblem =
        finalizeErr ||
        (typeof finalizeResult.thumbnailError === "string"
          ? (finalizeResult.thumbnailError as string)
          : null);
      setToast({
        kind: "success",
        title: thumbProblem
          ? "Video uploaded — thumbnail couldn't be set"
          : "Published to YouTube",
        detail: thumbProblem ?? info.title,
        href: url,
      });
      // Reflect on the row
      setFiles((fs) =>
        fs.map((f) =>
          f.id === info.fileId
            ? {
                ...f,
                publishStates: [
                  ...f.publishStates,
                  {
                    platform: "youtube",
                    action: info.init.publishAt ? "scheduled" : "published",
                    vidType: info.init.vidType,
                  },
                ],
              }
            : f,
        ),
      );
    } catch (err) {
      setToast({
        kind: "error",
        title: "YouTube upload failed",
        detail: (err as Error).message,
      });
    }
  };

  const [modal, setModal] = useState<
    | null
    | { kind: "ai" | "youtube" | "spotify" | "opus" | "preview"; fileId: string }
    | { kind: "request-approval" }
  >(null);

  const filtered = useMemo(() => {
    const byType = files.filter((f) => f.type === activeTab);
    if (!search.trim()) return byType;
    const q = search.toLowerCase();
    return byType.filter((f) => f.name.toLowerCase().includes(q));
  }, [files, activeTab, search]);

  const counts: Record<FileType, number> = {
    raw: files.filter((f) => f.type === "raw").length,
    edited: files.filter((f) => f.type === "edited").length,
    clip: files.filter((f) => f.type === "clip").length,
    asset: files.filter((f) => f.type === "asset").length,
  };

  const updateApproval = async (fileId: string, next: FileItem["approvalStatus"]) => {
    setFiles((fs) =>
      fs.map((f) => (f.id === fileId ? { ...f, approvalStatus: next } : f)),
    );
    await fetch(`/api/files/${fileId}/meta`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvalStatus: next }),
    }).catch(() => {});
  };

  const toggleSelect = (fileId: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(fileId);
      else next.delete(fileId);
      return next;
    });
  };

  const selectAllInTab = () => {
    setSelected(new Set(filtered.map((f) => f.id)));
  };

  const clearSelection = () => setSelected(new Set());

  const moveSelectedTo = async (target: FileType) => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setFiles((fs) =>
      fs.map((f) => (selected.has(f.id) ? { ...f, type: target } : f)),
    );
    setActiveTab(target);
    clearSelection();
    await Promise.all(
      ids.map((id) =>
        fetch(`/api/files/${id}/meta`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: target }),
        }).catch(() => {}),
      ),
    );
  };

  const deleteSelected = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setFiles((fs) => fs.filter((f) => !selected.has(f.id)));
    clearSelection();
    await Promise.all(
      ids.map((id) => fetch(`/api/files/${id}`, { method: "DELETE" }).catch(() => {})),
    );
    router.refresh();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Bail if a modal (AI Studio / YouTube / Spotify / etc.) is open.
      if (modal !== null) return;
      if (contextMenu !== null) return;

      // Bail if focus is inside ANY editable element (covers selects, contenteditable,
      // any input type — not just INPUT/TEXTAREA).
      const active = document.activeElement as HTMLElement | null;
      if (active) {
        const tag = active.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          active.isContentEditable
        ) {
          return;
        }
      }

      // Defensive: also check the event target itself
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable
        ) {
          return;
        }
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelected(new Set(filtered.map((f) => f.id)));
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selected.size > 0) {
        e.preventDefault();
        if (confirm(`Delete ${selected.size} file(s)? This can't be undone.`)) {
          void deleteSelected();
        }
      }
      if (e.key === "Escape") setSelected(new Set());
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, selected.size, modal, contextMenu]);

  const downloadFile = async (fileId: string, filename: string) => {
    try {
      const res = await fetch(`/api/files/${fileId}/download`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { signedUrl } = (await res.json()) as { signedUrl: string };

      // Fetch the bytes so the browser triggers a real download. The plain
      // <a download> attribute is ignored for cross-origin URLs without
      // Content-Disposition, which B2 doesn't send by default.
      const fileRes = await fetch(signedUrl);
      if (!fileRes.ok) throw new Error(`B2 ${fileRes.status}`);
      const blob = await fileRes.blob();
      const objectUrl = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (e) {
      alert("Download failed: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  // ThumbnailStudio dispatches this when the user clicks "Save & post to
  // YouTube" — open the YT modal for that file with the new cover preselected.
  useEffect(() => {
    function onOpenYT(e: Event) {
      const detail = (e as CustomEvent).detail as { fileId?: string } | undefined;
      if (!detail?.fileId) return;
      setModal({ kind: "youtube", fileId: detail.fileId });
    }
    window.addEventListener("onpod:open-youtube", onOpenYT);
    return () => window.removeEventListener("onpod:open-youtube", onOpenYT);
  }, []);

  const startAI = async (fileId: string) => {
    if (aiReady[fileId]) {
      setModal({ kind: "ai", fileId });
      return;
    }
    if (aiProgress[fileId] !== undefined) return;
    setAiProgress((p) => ({ ...p, [fileId]: 1 }));

    try {
      const kickRes = await fetch(`/api/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId }),
      });
      if (!kickRes.ok) {
        const text = await kickRes.text();
        throw new Error(`transcribe ${kickRes.status}: ${text.slice(0, 200)}`);
      }
      const kick = (await kickRes.json()) as { status: string };
      if (kick.status === "ready") {
        setAiReady((r) => ({ ...r, [fileId]: true }));
        setAiProgress((p) => {
          const { [fileId]: _gone, ...rest } = p;
          void _gone;
          return rest;
        });
        return;
      }
    } catch (err) {
      console.error(err);
      alert("Failed to start transcription: " + (err as Error).message);
      setAiProgress((p) => {
        const { [fileId]: _gone, ...rest } = p;
        void _gone;
        return rest;
      });
      return;
    }

    const poll = async () => {
      try {
        const res = await fetch(`/api/transcribe/${fileId}/status`);
        const data = (await res.json()) as {
          status: string;
          progress: number;
          error?: string;
        };
        if (data.status === "ready") {
          setAiReady((r) => ({ ...r, [fileId]: true }));
          setAiProgress((p) => {
            const { [fileId]: _gone, ...rest } = p;
            void _gone;
            return rest;
          });
          return;
        }
        if (data.status === "error") {
          alert(`Transcription failed: ${data.error ?? "unknown error"}`);
          setAiProgress((p) => {
            const { [fileId]: _gone, ...rest } = p;
            void _gone;
            return rest;
          });
          return;
        }
        setAiProgress((p) => ({ ...p, [fileId]: data.progress }));
        setTimeout(poll, 5000);
      } catch (err) {
        console.error(err);
        setTimeout(poll, 8000);
      }
    };
    setTimeout(poll, 2000);
  };

  return (
    <>
      <div className="-mx-4 sm:mx-0 mb-5 overflow-x-auto">
        <div className="flex items-center gap-2 bg-bg-elev border border-border rounded-[12px] p-1 w-fit min-w-min px-4 sm:px-1 sm:mx-0">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-3 sm:px-4 py-2 rounded-[8px] text-[12px] sm:text-[13px] font-medium flex items-center gap-2 transition shrink-0 ${
                activeTab === t.key ? "bg-bg-elev-3 text-text" : "text-text-muted hover:text-text"
              }`}
            >
              {t.label}
              <span
                className={`text-[11px] px-[7px] py-[2px] rounded-full ${
                  activeTab === t.key ? "bg-accent text-white" : "bg-[rgba(255,255,255,0.08)]"
                }`}
              >
                {counts[t.key]}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-5 gap-3 sm:gap-4">
        <div className="relative w-full sm:max-w-[360px]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim">
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
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={selectAllInTab}
            title="⌘A"
            className="px-3 py-2 rounded-[8px] bg-bg-elev border border-border hover:border-border-strong text-[12px] sm:text-[13px]"
          >
            Select all
          </button>
          {canMarkDone ? (
            <button
              onClick={() => setModal({ kind: "request-approval" })}
              className="px-3 py-2 rounded-[8px] bg-bg-elev border border-border hover:border-border-strong text-[12px] sm:text-[13px]"
            >
              Request approval
            </button>
          ) : null}
          <button className="px-3 py-2 rounded-[8px] bg-bg-elev border border-border hover:border-border-strong text-[12px] sm:text-[13px]">
            Download all
          </button>
          {canMarkDone && !studioContext ? (
            <UploadButton projectId={projectId} />
          ) : null}
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
              onContextMenu={(e) => {
                e.preventDefault();
                if (!selected.has(f.id)) setSelected(new Set([f.id]));
                setContextMenu({ x: e.clientX, y: e.clientY });
              }}
              className={`flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 sm:py-4 border rounded-lg transition ${rowStyle(f, selected.has(f.id))}`}
            >
              <div className="flex items-center gap-3 sm:gap-4 min-w-0 sm:flex-1">
                <input
                  type="checkbox"
                  checked={selected.has(f.id)}
                  onChange={(e) => toggleSelect(f.id, e.target.checked)}
                  className="accent-accent w-4 h-4 shrink-0"
                  aria-label={`Select ${f.name}`}
                />
                <FileIcon mime={f.mimeType} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-[13px] sm:text-[14px] truncate">{f.name}</div>
                  <div className="text-[11px] sm:text-[12px] text-text-muted mt-1 flex items-center gap-2 flex-wrap">
                    <span>{formatBytes(f.sizeBytes)}</span>
                    <span>·</span>
                    <span>{new Date(f.uploadedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                    {/(\.(mp4|mov|webm))$/i.test(f.name) ? (
                      <VersionMenu fileId={f.id} canManage={canMarkDone} />
                    ) : null}
                    <FileStatusBadges file={f} />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 justify-end sm:gap-3 -mx-1 sm:mx-0 overflow-x-auto sm:overflow-visible px-1 sm:px-0">
                {needsApproval(f) ? (
                  <ApprovalToggle
                    value={f.approvalStatus}
                    onChange={(next) => updateApproval(f.id, next)}
                    inRevision={!!revisionByFile[f.id]}
                  />
                ) : (
                  <div className="hidden sm:block w-[170px] shrink-0" aria-hidden="true" />
                )}

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
              </div>
            </li>
          ))
        )}
      </ul>

      {toast ? (
        <div
          className={`fixed z-[120] top-20 right-4 sm:right-6 w-[320px] sm:w-[380px] flex flex-col gap-2 p-3 sm:p-4 rounded-[12px] border shadow-modal ${
            toast.kind === "success"
              ? "bg-[rgba(16,185,129,0.12)] border-[rgba(16,185,129,0.4)] text-[#34d399]"
              : toast.kind === "error"
                ? "bg-[rgba(239,68,68,0.12)] border-[rgba(239,68,68,0.4)] text-[#f87171]"
                : "bg-bg-elev-2 border-border-strong text-text"
          }`}
        >
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium">{toast.title}</div>
              {toast.detail ? (
                <div className="text-[11px] text-text-muted mt-0.5 truncate">{toast.detail}</div>
              ) : null}
              {toast.href ? (
                <a
                  href={toast.href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[12px] underline mt-1 inline-block break-all"
                >
                  {toast.href}
                </a>
              ) : null}
            </div>
            <button
              onClick={() => setToast(null)}
              className="text-[18px] leading-none opacity-70 hover:opacity-100"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
          {toast.kind === "progress" ? (
            <div className="h-1 rounded-full bg-bg-elev-3 overflow-hidden">
              <div
                className="h-full bg-accent transition-all"
                style={{ width: `${toast.percent ?? 0}%` }}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {contextMenu ? (
        <FileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          selectedCount={selected.size}
          onMove={moveSelectedTo}
          onDelete={deleteSelected}
          onSelectAll={selectAllInTab}
          onClose={() => setContextMenu(null)}
        />
      ) : null}

      {selected.size > 0 ? (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-bg-elev-2 border border-border-strong rounded-xl px-4 py-3 shadow-modal">
          <span className="text-[13px] font-medium">{selected.size} selected</span>
          <span className="text-[11px] text-text-muted hidden md:inline">
            right-click for actions · ⌘A all · ⌫ delete · esc clear
          </span>
          <div className="w-px h-5 bg-border mx-2" />
          <button
            onClick={clearSelection}
            className="px-3 py-1.5 rounded-[8px] text-[12px] text-text-muted hover:text-text"
          >
            Clear
          </button>
        </div>
      ) : null}

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
          onPublished={(info) => {
            void runYouTubeUpload(info);
          }}
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
          currentEmail={currentUserEmail}
          canMarkDone={canMarkDone}
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

function rowStyle(f: FileItem, isSelected: boolean): string {
  const selectedRing = isSelected ? "ring-2 ring-accent " : "";
  const published = f.publishStates.some((s) => s.action === "published");
  const scheduled = f.publishStates.some((s) => s.action === "scheduled");
  if (published)
    return selectedRing + "bg-[rgba(59,130,246,0.06)] border-[rgba(59,130,246,0.25)] hover:bg-[rgba(59,130,246,0.10)]";
  if (scheduled)
    return selectedRing + "bg-[rgba(245,158,11,0.05)] border-[rgba(245,158,11,0.22)] hover:bg-[rgba(245,158,11,0.09)]";
  if (f.approvalStatus === "approved")
    return selectedRing + "bg-[rgba(16,185,129,0.05)] border-[rgba(16,185,129,0.22)] hover:bg-[rgba(16,185,129,0.09)]";
  return selectedRing + "bg-bg-elev border-border hover:bg-bg-elev-2 hover:border-border-strong";
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
