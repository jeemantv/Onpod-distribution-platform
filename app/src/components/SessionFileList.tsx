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

export function SessionFileList({
  studio,
  bucket,
  folder,
  files,
  canEdit,
  canDelete,
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
      <p className="text-text-muted text-[13px]">No files in this session.</p>
    );
  }

  return (
    <div className="bg-bg-elev border border-border rounded-[16px] overflow-hidden">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-text-muted text-[11px] uppercase tracking-wider border-b border-border">
            <th className="text-left p-4 font-medium">File</th>
            <th className="text-left p-4 font-medium">Size</th>
            <th className="text-left p-4 font-medium">Modified</th>
            <th className="text-right p-4 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {files.map((f) => (
            <tr
              key={f.key}
              className="border-b border-border last:border-0 hover:bg-bg-elev-2"
            >
              <td className="p-4 font-mono text-[12px]">{f.filename}</td>
              <td className="p-4 text-text-muted">{fmt(f.sizeBytes)}</td>
              <td className="p-4 text-text-muted">
                {f.lastModified
                  ? new Date(f.lastModified).toLocaleString()
                  : "—"}
              </td>
              <td className="p-4 text-right">
                <a
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block px-3 py-1.5 rounded-[8px] bg-bg-elev-3 border border-border text-[12px] mr-2"
                >
                  Download
                </a>
                {canEdit && bucket !== "to-delete" ? (
                  <button
                    onClick={() => void moveFile(f.filename, "to-delete")}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-[8px] bg-bg-elev-3 border border-border text-[12px] disabled:opacity-50"
                  >
                    Move to delete
                  </button>
                ) : null}
                {canDelete && bucket === "to-delete" ? (
                  <span className="text-[11px] text-text-dim">
                    Use bucket-level delete
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
