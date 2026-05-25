"use client";

// Inline version picker + uploader for a single video file. Staff only.
// - "+ Upload v{N}" button kicks off a multipart upload of a new version.
// - Tap the V{active} chip → menu showing every version, with a button
//   to make any of them the active one (or download).

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadNewVersion, type UploadProgress } from "@/lib/version-uploader";

interface VersionEntry {
  n: number;
  key: string;
  url: string;
  uploadedAt: number;
  uploadedByEmail: string;
  uploadedByName?: string;
  note?: string;
}

interface VersionsResponse {
  versions: { active: number; versions: VersionEntry[] } | null;
}

function fmtAge(ms: number): string {
  if (!ms) return "—";
  const d = (Date.now() - ms) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

export function VersionMenu({
  fileId,
  canManage,
  onChange,
  showNewBadge,
  showRevisedBadge,
}: {
  fileId: string;
  canManage: boolean;
  onChange?: () => void;
  // When true AND active > 1, render a "NEW" pill next to the version
  // chip. The parent decides — typically: client viewer + approvalStatus
  // is "pending" (editor just uploaded a follow-up).
  showNewBadge?: boolean;
  // When true AND active > 1, render a "REVISED" pill instead of NEW —
  // signals to the client that this version addresses their previous
  // revision request. Parent passes true when there's existing revision
  // history on the file.
  showRevisedBadge?: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState<VersionsResponse["versions"]>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/files/${fileId}/versions`, { cache: "no-store" });
      const json = (await res.json()) as VersionsResponse;
      setData(json.versions);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await uploadNewVersion({
        sourceFileId: fileId,
        file: files[0],
        onProgress: setProgress,
      });
      await load();
      onChange?.();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      setProgress(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function makeActive(n: number) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/upload-version/set-active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceFileId: fileId, n }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        setError(t.slice(0, 200) || `Failed (${res.status})`);
        return;
      }
      await load();
      onChange?.();
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;
  const versions = data?.versions ?? [];
  const active = data?.active ?? 1;
  const hasMultiple = versions.length > 1;
  const nextN = (versions.length ? Math.max(...versions.map((v) => v.n)) : 1) + 1;

  // Revised wins over New — both require active >= 2.
  const showRevised = !!showRevisedBadge && active >= 2;
  const showNew = !showRevised && !!showNewBadge && active >= 2;

  return (
    <div ref={wrapRef} className="relative inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => hasMultiple && setOpen((v) => !v)}
        disabled={!hasMultiple}
        className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider border ${
          hasMultiple
            ? "bg-accent-2 text-bg border-transparent cursor-pointer"
            : "bg-bg-elev-3 border-border text-text-muted"
        }`}
        title={hasMultiple ? `${versions.length} versions — click to switch` : "Only one version"}
      >
        v{active}
      </button>
      {showRevised ? (
        <span
          className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider bg-accent text-white animate-pulse"
          title="The editor addressed your revision request — review and approve."
        >
          REVISED
        </span>
      ) : showNew ? (
        <span
          className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider bg-accent text-white animate-pulse"
          title="The editor uploaded a new version for your review."
        >
          NEW
        </span>
      ) : null}

      {canManage ? (
        <>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy}
            className="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider bg-bg-elev-3 border border-border hover:border-border-strong disabled:opacity-50"
            title="Upload a new version"
          >
            {busy
              ? progress
                ? `↑ ${Math.round((progress.done / progress.total) * 100)}%`
                : "uploading…"
              : `+ v${nextN}`}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => void handleUpload(e.target.files)}
          />
        </>
      ) : null}

      {open && hasMultiple ? (
        // z-[1000] sits above the <video> element, which natively
        // composites high in some browsers and was eating the dropdown
        // rows. The opaque background + border keeps it readable.
        <div className="absolute left-0 top-full mt-1 z-[1000] w-72 bg-bg-elev border border-border rounded-[10px] shadow-float p-2">
          <div className="text-[10px] uppercase tracking-wider text-text-dim px-2 py-1">
            Versions
          </div>
          {[...versions].sort((a, b) => b.n - a.n).map((v) => (
            <div
              key={v.n}
              className={`flex items-center gap-2 px-2 py-2 rounded-[8px] ${
                v.n === active ? "bg-bg-elev-3" : "hover:bg-bg-elev-2"
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-medium">
                  v{v.n}
                  {v.n === active ? (
                    <span className="ml-2 text-[10px] text-accent-2 uppercase">active</span>
                  ) : null}
                </div>
                <div className="text-[10px] text-text-dim truncate">
                  {v.uploadedByName ?? v.uploadedByEmail ?? "—"} ·{" "}
                  {fmtAge(v.uploadedAt)}
                  {v.note ? ` · ${v.note}` : ""}
                </div>
              </div>
              <a
                href={v.url}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-text-muted hover:text-text"
                title="Open this version"
              >
                ↗
              </a>
              {v.n !== active ? (
                <button
                  onClick={() => makeActive(v.n)}
                  disabled={busy}
                  className="px-2 py-1 rounded-[6px] bg-accent text-white text-[11px] disabled:opacity-50"
                  title="Switch this video to display this version"
                >
                  Use
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {error ? (
        <span className="text-[10px] text-danger ml-1" title={error}>
          ✕
        </span>
      ) : null}
    </div>
  );
}
