"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { FileItem, FileType } from "@/lib/types";
import { formatBytes } from "@/lib/format";
import { FileActionButtons } from "./FileActionButtons";
import { StatusDropdown } from "./StatusDropdown";
import { FileStatusBadges } from "./FileStatusBadges";
import type { FileStatus } from "@/lib/file-statuses-store";
import { VersionMenu } from "@/components/VersionMenu";
import { AIStudioModal } from "./AIStudioModal";
import { YouTubeModal, type PublishedInfo as YTPublishedInfo } from "./YouTubeModal";
import { uploadToYouTube, type UploadProgress } from "@/lib/yt-uploader";
import { BuzzsproutModal } from "./BuzzsproutModal";
import { OpusClipModal } from "./OpusClipModal";
import { RequestApprovalModal } from "./RequestApprovalModal";
import { UploadButton } from "./UploadButton";
import { PreviewModal } from "./PreviewModal";
import { FilePreview } from "./FilePreview";
import { FileContextMenu } from "./FileContextMenu";
import { SessionUploader } from "@/components/SessionUploader";
import type { Bucket, StudioSlug } from "@/lib/studio";

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
  studioSlug,
  currentUserEmail = "",
  canMarkDone = false,
  userPlan = "free",
  userRole = "client",
  canUpload = false,
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
  // Studio whose file_statuses list governs the dropdown options. For
  // studio paths this is the path's studio; for client paths it's the
  // user's homeStudio. Falls back to "_default" if not provided.
  studioSlug?: string;
  // Passed down to PreviewModal so the embedded VideoReviewer knows
  // who's logged in and whether they can mark notes done.
  currentUserEmail?: string;
  canMarkDone?: boolean;
  // Used by FileActionButtons to grey out AI/YouTube/Spotify/Clips
  // buttons when the viewer's plan doesn't include those features.
  // Admin + editor bypass at the click handler.
  userPlan?: string;
  userRole?: string;
  // When true, renders an inline SessionUploader. The file gets stamped
  // with the currently-active tab's type so uploads land where the user
  // is looking (Raw / Edited / Clips / Assets).
  canUpload?: boolean;
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
  // Tracks whether the client has formally "Sent revision request" on a
  // file (revisions.reviewSentAt is set AND the most recent note is
  // older than that send). Used to surface a "Revision requested" badge
  // on the file row so both editor and client see the loop state.
  const [revisionSentByFile, setRevisionSentByFile] = useState<Record<string, boolean>>({});
  // True for any file that has ≥1 note in its revisions sidecar (open or
  // done). Used to mark a re-uploaded version as "Revised" instead of
  // "New" so the client knows their feedback was addressed.
  const [hasRevisionHistory, setHasRevisionHistory] = useState<Record<string, boolean>>({});

  // Sync the local files state when the server pushes fresh props
  // (after router.refresh() following a version upload, approval flip,
  // etc.). Without this, stale approvalStatus / version data persists
  // and badges look wrong.
  useEffect(() => {
    setFiles(initialFiles);
  }, [initialFiles]);

  // Reload revision metadata whenever the file list changes — so a
  // newly-uploaded v2/v3 clears the "In revision" / "Revision requested"
  // flags from the editor's view.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const open: Record<string, boolean> = {};
      const sent: Record<string, boolean> = {};
      const history: Record<string, boolean> = {};
      for (const f of files) {
        if (!/\.(mp4|mov|webm)$/i.test(f.name)) continue;
        try {
          const r = await fetch(`/api/revisions/${f.id}`, { cache: "no-store" });
          if (!r.ok) continue;
          const data = await r.json();
          const notes = (data.revisions?.notes ?? []) as { status: string; createdAt: number }[];
          const reviewSentAt = (data.revisions?.reviewSentAt ?? 0) as number;
          const openCount = notes.filter((n) => n.status === "open").length;
          if (openCount > 0) open[f.id] = true;
          if (notes.length > 0) history[f.id] = true;
          const newest = notes.reduce((acc, n) => Math.max(acc, n.createdAt), 0);
          if (reviewSentAt > 0 && newest <= reviewSentAt) sent[f.id] = true;
        } catch {
          /* ignore */
        }
        if (cancelled) return;
      }
      if (!cancelled) {
        setRevisionByFile(open);
        setRevisionSentByFile(sent);
        setHasRevisionHistory(history);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [files]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Tracks the last file the user (de)selected so shift-click can fill in
  // the range between it and the next click.
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  // View mode persists per browser so the user's choice survives reloads.
  const [view, setView] = useState<"list" | "preview" | "gallery">(() => {
    if (typeof window === "undefined") return "list";
    const saved = window.localStorage.getItem("onpod:file-view");
    return saved === "preview" || saved === "gallery" ? saved : "list";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("onpod:file-view", view);
    }
  }, [view]);
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

  // Per-studio status list (loaded once on mount). All dropdowns on this
  // page share the same array so a rename/recolor/add reflects across
  // every row immediately.
  const [statuses, setStatuses] = useState<FileStatus[]>([]);
  const effectiveStudio = studioSlug ?? studioContext?.studio ?? "_default";
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/file-statuses?studio=${encodeURIComponent(effectiveStudio)}`)
      .then((r) => r.json())
      .then((b: { statuses?: FileStatus[] }) => {
        if (!cancelled && b.statuses) setStatuses(b.statuses);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [effectiveStudio]);

  const canEditStatuses = userRole === "admin" || userRole === "editor";

  const updateStatusId = async (fileId: string, statusId: string | null) => {
    setFiles((fs) =>
      fs.map((f) => (f.id === fileId ? { ...f, statusId } : f)),
    );
    // Mirror picks of the 3 seeded statuses into approvalStatus so the
    // legacy flows (revision badges, request-approval gating, etc.)
    // keep working. Custom statuses leave approvalStatus untouched.
    const picked = statuses.find((s) => s.id === statusId);
    const legacy = picked?.legacyValue as FileItem["approvalStatus"] | undefined;
    await fetch(`/api/files/${fileId}/meta`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        statusId,
        ...(legacy ? { approvalStatus: legacy } : {}),
      }),
    }).catch(() => {});
    if (legacy) {
      setFiles((fs) =>
        fs.map((f) => (f.id === fileId ? { ...f, approvalStatus: legacy } : f)),
      );
    }
  };

  const createStatus = async (label: string, color: string) => {
    const res = await fetch("/api/file-statuses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studio: effectiveStudio, label, color }),
    });
    const body = (await res.json().catch(() => ({}))) as { status?: FileStatus };
    if (body.status) setStatuses((prev) => [...prev, body.status!]);
  };

  const patchStatus = async (id: string, patch: { label?: string; color?: string }) => {
    const res = await fetch(`/api/file-statuses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const body = (await res.json().catch(() => ({}))) as { status?: FileStatus };
    if (body.status) {
      setStatuses((prev) => prev.map((s) => (s.id === id ? body.status! : s)));
    }
  };

  const deleteStatus = async (id: string) => {
    await fetch(`/api/file-statuses/${id}`, { method: "DELETE" });
    setStatuses((prev) => prev.filter((s) => s.id !== id));
    // Files that were on this status fall back to default (null status_id).
    setFiles((fs) =>
      fs.map((f) => (f.statusId === id ? { ...f, statusId: null } : f)),
    );
  };

  const toggleSelect = (
    fileId: string,
    checked: boolean,
    event?: { shiftKey?: boolean },
  ) => {
    // Shift-click: pick everything between the last (de)selected file
    // and this one in the current filtered order. The "checked" arg
    // wins for the whole range — selects if true, clears if false.
    if (event?.shiftKey && lastSelectedId && lastSelectedId !== fileId) {
      const ids = filtered.map((f) => f.id);
      const a = ids.indexOf(lastSelectedId);
      const b = ids.indexOf(fileId);
      if (a !== -1 && b !== -1) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        const range = ids.slice(lo, hi + 1);
        setSelected((prev) => {
          const next = new Set(prev);
          for (const id of range) {
            if (checked) next.add(id);
            else next.delete(id);
          }
          return next;
        });
        setLastSelectedId(fileId);
        return;
      }
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(fileId);
      else next.delete(fileId);
      return next;
    });
    setLastSelectedId(fileId);
  };

  // Toggle: click once selects all visible in tab; click again clears.
  const toggleSelectAllInTab = () => {
    const ids = filtered.map((f) => f.id);
    const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
    setSelected(allSelected ? new Set() : new Set(ids));
    setLastSelectedId(null);
  };

  const clearSelection = () => {
    setSelected(new Set());
    setLastSelectedId(null);
  };

  // For a single file we use the inline download (memory-cheap). For
  // multiple files we bundle into a .zip server-side — browsers block
  // rapid programmatic multi-downloads, and zip gives the client one
  // clean archive.
  const downloadSelected = async () => {
    const ids = Array.from(selected);
    const targets = filtered.filter((f) => ids.includes(f.id));
    if (targets.length === 0) return;
    if (targets.length === 1) {
      await downloadFile(targets[0].id, targets[0].name);
      return;
    }
    // The server STORE-zips (no recompression), so the streamed archive is
    // ~the sum of source sizes + small overhead. That lets us show a real %
    // as bytes arrive instead of a silent wait while the whole zip builds.
    const estTotal = targets.reduce((sum, f) => sum + (f.sizeBytes || 0), 0);
    const zipName = `onpod-${targets.length}-files`;
    setToast({
      kind: "progress",
      title: `Zipping ${targets.length} files…`,
      detail: estTotal ? `0 / ${formatBytes(estTotal)}` : "Preparing…",
      percent: 0,
      sticky: true,
    });

    try {
      const res = await fetch("/api/files/zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileIds: targets.map((t) => t.id), name: zipName }),
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        throw new Error(`Zip failed (${res.status}) ${text.slice(0, 200)}`);
      }

      // Read the streamed response chunk-by-chunk so we can paint progress.
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;
      let lastPaint = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        chunks.push(value);
        received += value.length;
        const now = Date.now();
        // Throttle re-renders to ~10/s.
        if (now - lastPaint > 100) {
          lastPaint = now;
          setToast({
            kind: "progress",
            title: `Zipping ${targets.length} files…`,
            detail: estTotal
              ? `${formatBytes(received)} / ${formatBytes(estTotal)}`
              : formatBytes(received),
            // Cap at 99% until the stream actually ends (overhead can push
            // received slightly past the estimate).
            percent: estTotal ? Math.min(99, Math.round((received / estTotal) * 100)) : undefined,
            sticky: true,
          });
        }
      }

      const blob = new Blob(chunks as BlobPart[], { type: "application/zip" });
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `${zipName}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

      setToast({
        kind: "success",
        title: `Downloaded ${targets.length} files`,
        detail: formatBytes(blob.size),
      });
    } catch (err) {
      setToast({
        kind: "error",
        title: "Bulk download failed",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  };

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

  // Bulk-set a status on every selected file that supports approval. Reuses
  // the per-file updateStatusId so the optimistic state + legacy-approval
  // mirroring stay identical.
  const setStatusForSelected = async (statusId: string | null) => {
    const targets = files.filter((f) => selected.has(f.id) && needsApproval(f));
    if (targets.length === 0) return;
    const label = statuses.find((s) => s.id === statusId)?.label ?? "status";
    await Promise.all(targets.map((f) => updateStatusId(f.id, statusId)));
    setToast({
      kind: "success",
      title: `Set ${targets.length} file${targets.length === 1 ? "" : "s"} to “${label}”`,
    });
  };

  // Bulk "Add AI": kick off transcription + AI generation on every selected
  // video that doesn't already have AI. startAI shows the per-file progress
  // ring and only opens the modal for already-ready files (which we skip).
  const addAIToSelected = () => {
    const targets = files.filter(
      (f) =>
        selected.has(f.id) &&
        f.mimeType.startsWith("video/") &&
        f.type !== "asset" &&
        !aiReady[f.id] &&
        aiProgress[f.id] === undefined,
    );
    if (targets.length === 0) {
      setToast({
        kind: "error",
        title: "Nothing to do",
        detail: "AI runs on videos that don't already have AI generated.",
      });
      return;
    }
    setToast({
      kind: "success",
      title: `Starting AI on ${targets.length} file${targets.length === 1 ? "" : "s"}…`,
      detail: "Watch the AI ring on each file.",
    });
    for (const f of targets) void startAI(f.id);
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
      {canUpload && studioContext ? (
        <div className="mb-5">
          <SessionUploader
            studio={studioContext.studio as StudioSlug}
            bucket={studioContext.bucket as Bucket}
            folder={studioContext.folder}
            defaultType={activeTab}
          />
        </div>
      ) : null}

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
          <div className="inline-flex border border-border rounded-[8px] overflow-hidden text-[12px] sm:text-[13px]">
            {(["list", "preview", "gallery"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setView(m)}
                title={
                  m === "list"
                    ? "Compact rows"
                    : m === "preview"
                      ? "Rows with thumbnail"
                      : "Grid with large previews"
                }
                className={
                  view === m
                    ? "px-3 py-2 bg-bg-elev-3 text-text"
                    : "px-3 py-2 bg-bg-elev text-text-muted hover:text-text hover:bg-bg-elev-2"
                }
              >
                {m === "list" ? "List" : m === "preview" ? "Preview" : "Gallery"}
              </button>
            ))}
          </div>
          {/* Toggles: clicking again clears (replaces the old "Clear"
              button that lived in the bottom bar). */}
          {(() => {
            const ids = filtered.map((f) => f.id);
            const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
            return (
              <button
                onClick={toggleSelectAllInTab}
                title="⌘A"
                className="px-3 py-2 rounded-[8px] bg-bg-elev border border-border hover:border-border-strong text-[12px] sm:text-[13px]"
              >
                {allSelected ? "Deselect all" : "Select all"}
              </button>
            );
          })()}
          {canMarkDone ? (
            <button
              onClick={() => setModal({ kind: "request-approval" })}
              className="px-3 py-2 rounded-[8px] bg-bg-elev border border-border hover:border-border-strong text-[12px] sm:text-[13px]"
            >
              Request approval
            </button>
          ) : null}
          <button
            onClick={downloadSelected}
            disabled={selected.size === 0}
            className="px-3 py-2 rounded-[8px] bg-bg-elev border border-border hover:border-border-strong text-[12px] sm:text-[13px] disabled:opacity-50"
          >
            Download{selected.size > 0 ? ` (${selected.size})` : ""}
          </button>
          {canMarkDone && !studioContext ? (
            <UploadButton projectId={projectId} />
          ) : null}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-bg-elev border border-border rounded-lg px-5 py-10 text-center text-text-muted text-[13px]">
          No files in this folder yet.
        </div>
      ) : view === "gallery" ? (
        <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((f) => (
            <li
              key={f.id}
              onContextMenu={(e) => {
                e.preventDefault();
                if (!selected.has(f.id)) setSelected(new Set([f.id]));
                setContextMenu({ x: e.clientX, y: e.clientY });
              }}
              className={`flex flex-col border rounded-lg overflow-hidden transition ${rowStyle(f, selected.has(f.id))}`}
            >
              <button
                onClick={() => setModal({ kind: "preview", fileId: f.id })}
                title="Open preview"
                className="block w-full"
              >
                <FilePreview file={f} size="lg" />
              </button>
              <div className="p-3 flex flex-col gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <input
                    type="checkbox"
                    checked={selected.has(f.id)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) =>
                      toggleSelect(f.id, e.target.checked, {
                        shiftKey: (e.nativeEvent as MouseEvent).shiftKey,
                      })
                    }
                    className="accent-accent w-4 h-4 shrink-0 mt-0.5"
                    aria-label={`Select ${f.name}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[12px] truncate">{f.name}</div>
                    <div className="text-[11px] text-text-muted mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span>{formatBytes(f.sizeBytes)}</span>
                      {/(\.(mp4|mov|webm))$/i.test(f.name) ? (
                        <VersionMenu
                          fileId={f.id}
                          canManage={canMarkDone}
                          showNewBadge={
                            !canMarkDone &&
                            f.approvalStatus === "pending" &&
                            !hasRevisionHistory[f.id]
                          }
                          showRevisedBadge={
                            !canMarkDone &&
                            f.approvalStatus === "pending" &&
                            !!hasRevisionHistory[f.id]
                          }
                        />
                      ) : null}
                    </div>
                    <div className="mt-1 flex items-center gap-1 flex-wrap">
                      <FileStatusBadges file={f} />
                    </div>
                  </div>
                </div>
                {needsApproval(f) ? (
                  <StatusDropdown
                    statuses={statuses}
                    currentId={f.statusId ?? null}
                    legacyValue={f.approvalStatus !== "none" ? f.approvalStatus : null}
                    inRevision={!!revisionByFile[f.id]}
                    canEdit={canEditStatuses}
                    onChange={(id) => updateStatusId(f.id, id)}
                    onCreate={createStatus}
                    onUpdate={patchStatus}
                    onDelete={deleteStatus}
                  />
                ) : (
                  <div className="hidden sm:block w-[170px] shrink-0" aria-hidden="true" />
                )}
                {/* Action buttons sit on their own row in gallery so they
                    don't overflow the narrow card width — overflow-x-auto
                    keeps them reachable even on small viewports. */}
                <div className="-mx-1 overflow-x-auto px-1">
                  <FileActionButtons
                    file={f}
                    aiReady={!!aiReady[f.id]}
                    aiProgress={aiProgress[f.id]}
                    plan={userPlan}
                    role={userRole}
                    onAI={() => startAI(f.id)}
                    onYouTube={() => setModal({ kind: "youtube", fileId: f.id })}
                    onSpotify={() => setModal({ kind: "spotify", fileId: f.id })}
                    onOpus={() => setModal({ kind: "opus", fileId: f.id })}
                    onPreview={() => setModal({ kind: "preview", fileId: f.id })}
                    onDownload={() => downloadFile(f.id, f.name)}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((f) => (
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
                {view === "preview" ? (
                  <button
                    onClick={() => setModal({ kind: "preview", fileId: f.id })}
                    className="shrink-0"
                    title="Open preview"
                  >
                    <FilePreview file={f} size="sm" />
                  </button>
                ) : (
                  <FileIcon mime={f.mimeType} />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-[13px] sm:text-[14px] truncate">{f.name}</div>
                  <div className="text-[11px] sm:text-[12px] text-text-muted mt-1 flex items-center gap-2 flex-wrap">
                    <span>{formatBytes(f.sizeBytes)}</span>
                    <span>·</span>
                    <span>{new Date(f.uploadedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                    {/(\.(mp4|mov|webm))$/i.test(f.name) ? (
                      <VersionMenu fileId={f.id} canManage={canMarkDone} showNewBadge={!canMarkDone && f.approvalStatus === "pending"} />
                    ) : null}
                    <FileStatusBadges file={f} />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 justify-end sm:gap-3 -mx-1 sm:mx-0 overflow-x-auto sm:overflow-visible px-1 sm:px-0">
                {needsApproval(f) ? (
                  <StatusDropdown
                    statuses={statuses}
                    currentId={f.statusId ?? null}
                    legacyValue={f.approvalStatus !== "none" ? f.approvalStatus : null}
                    inRevision={!!revisionByFile[f.id]}
                    canEdit={canEditStatuses}
                    onChange={(id) => updateStatusId(f.id, id)}
                    onCreate={createStatus}
                    onUpdate={patchStatus}
                    onDelete={deleteStatus}
                  />
                ) : (
                  <div className="hidden sm:block w-[170px] shrink-0" aria-hidden="true" />
                )}

                <FileActionButtons
                  file={f}
                  aiReady={!!aiReady[f.id]}
                  aiProgress={aiProgress[f.id]}
                  plan={userPlan}
                  role={userRole}
                  onAI={() => startAI(f.id)}
                  onYouTube={() => setModal({ kind: "youtube", fileId: f.id })}
                  onSpotify={() => setModal({ kind: "spotify", fileId: f.id })}
                  onOpus={() => setModal({ kind: "opus", fileId: f.id })}
                  onPreview={() => setModal({ kind: "preview", fileId: f.id })}
                  onDownload={() => downloadFile(f.id, f.name)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

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
          onSelectAll={() =>
            setSelected(new Set(filtered.map((f) => f.id)))
          }
          onClose={() => setContextMenu(null)}
        />
      ) : null}

      {selected.size > 0 ? (
        (() => {
          const sel = files.filter((f) => selected.has(f.id));
          const approvable = sel.filter((f) => needsApproval(f)).length;
          const aiEligible = sel.filter(
            (f) =>
              f.mimeType.startsWith("video/") &&
              f.type !== "asset" &&
              !aiReady[f.id] &&
              aiProgress[f.id] === undefined,
          ).length;
          return (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-bg-elev-2 border border-border-strong rounded-xl px-4 py-3 shadow-modal flex-wrap max-w-[95vw] justify-center">
              <span className="text-[13px] font-medium">{selected.size} selected</span>

              {canEditStatuses && approvable > 0 && statuses.length > 0 ? (
                <span className="flex items-center gap-1.5">
                  <span className="text-[11px] text-text-muted">Set all:</span>
                  <StatusDropdown
                    statuses={statuses}
                    currentId={null}
                    legacyValue={null}
                    canEdit={canEditStatuses}
                    onChange={(id) => void setStatusForSelected(id)}
                    onCreate={createStatus}
                    onUpdate={patchStatus}
                    onDelete={deleteStatus}
                  />
                </span>
              ) : null}

              {aiEligible > 0 ? (
                <button
                  onClick={addAIToSelected}
                  className="px-3 py-1.5 rounded-[8px] bg-accent text-white text-[12px] font-medium"
                >
                  ✨ Add AI to all ({aiEligible})
                </button>
              ) : null}

              <button
                onClick={() => void downloadSelected()}
                className="px-3 py-1.5 rounded-[8px] bg-bg-elev-3 border border-border text-[12px]"
              >
                Download
              </button>
              <button
                onClick={clearSelection}
                className="px-2.5 py-1.5 rounded-[8px] text-[12px] text-text-muted hover:text-text"
              >
                Clear
              </button>
              <span className="text-[11px] text-text-dim hidden md:inline">
                right-click for more · ⌘A all · ⌫ delete
              </span>
            </div>
          );
        })()
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
        <BuzzsproutModal
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
          canManage={canMarkDone}
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
      {modal?.kind === "request-approval"
        ? (() => {
            // Selected-files-only: the email lists *only* what the editor
            // explicitly checked. Removed the old fallback to "all
            // unapproved files in the session" — that caused 5-file
            // emails when the editor really meant 1.
            const targets = files.filter(
              (f) => selected.has(f.id) && needsApproval(f) && f.approvalStatus === "none",
            );
            const targetIds = new Set(targets.map((t) => t.id));
            return (
              <RequestApprovalModal
                projectId={projectId}
                shareToken={shareToken}
                unapprovedFiles={targets}
                onClose={() => setModal(null)}
                onSent={() => {
                  setFiles((fs) =>
                    fs.map((f) =>
                      targetIds.has(f.id) ? { ...f, approvalStatus: "pending" } : f,
                    ),
                  );
                  setModal(null);
                }}
              />
            );
          })()
        : null}
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
