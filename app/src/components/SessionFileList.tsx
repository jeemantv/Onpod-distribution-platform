"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Bucket, StudioSlug } from "@/lib/studio";

interface FileRow {
  key: string;
  filename: string;
  sizeBytes: number;
  lastModified: string | null;
  url: string;
}

type Props = {
  studio: StudioSlug;
  bucket: Bucket;
  folder: string;
  files: FileRow[];
  canEdit: boolean;
  canDelete: boolean;
};

function fmt(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fileIcon(name: string) {
  const lower = name.toLowerCase();
  if (/\.(mp4|mov|webm|mkv)$/.test(lower)) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="23 7 16 12 23 17 23 7" />
        <rect x="1" y="5" width="15" height="14" rx="2" />
      </svg>
    );
  }
  if (/\.(mp3|wav|m4a|flac|aac|ogg)$/.test(lower)) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    );
  }
  if (/\.(png|jpg|jpeg|webp|gif)$/.test(lower)) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

export function SessionFileList({
  studio,
  bucket,
  folder,
  files,
  canEdit,
  canDelete: _canDelete,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function moveFile(filename: string, toBucket: Bucket) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromStudio: studio,
          fromBucket: bucket,
          toStudio: studio,
          toBucket,
          folder,
          filename,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.message || "Move failed.");
        setBusy(false);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (files.length === 0) {
    return (
      <div className="bg-bg-elev border border-border rounded-lg p-12 text-center">
        <p className="text-text-muted text-[13px]">No files in this session.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {files.map((f) => (
        <li key={f.key}>
          <div className="group flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 sm:py-4 bg-bg-elev border border-border rounded-lg hover:border-border-strong hover:bg-bg-elev-2 transition">
            <div className="w-10 h-10 rounded-md bg-bg-elev-3 flex items-center justify-center text-text-muted shrink-0">
              {fileIcon(f.filename)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-[13px] sm:text-[14px] truncate font-mono">
                {f.filename}
              </div>
              <p className="text-[11px] sm:text-[12px] text-text-muted mt-1">
                {fmt(f.sizeBytes)}
                {f.lastModified ? (
                  <> · {new Date(f.lastModified).toLocaleString()}</>
                ) : null}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href={f.url}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 rounded-[8px] bg-accent text-white text-[12px]"
              >
                Download
              </a>
              {canEdit && bucket !== "to-delete" ? (
                <button
                  onClick={() => void moveFile(f.filename, "to-delete")}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-[8px] bg-bg-elev-3 border border-border text-[12px] disabled:opacity-50 hover:border-border-strong"
                  title="Move file to the to-delete bucket"
                >
                  Trash
                </button>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
