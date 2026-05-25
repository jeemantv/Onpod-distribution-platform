"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SearchBar } from "@/components/SearchBar";

interface Row {
  studio: string;
  studioLabel: string;
  bucket: string;
  bucketLabel: string;
  folder: string;
  clientEmail: string | null;
  parsedDate?: string;
  parsedTime?: string;
  fileCount: number;
  sizeBytes: number;
  lastModified: string | null;
}

function fmtBytes(n: number): string {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function ProjectsTable({ rows }: { rows: Row[] }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) =>
      [
        r.folder,
        r.studio,
        r.studioLabel,
        r.bucket,
        r.bucketLabel,
        r.clientEmail ?? "",
        r.parsedDate ?? "",
        r.parsedTime ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(t),
    );
  }, [rows, q]);

  if (rows.length === 0) {
    return (
      <div className="bg-bg-elev border border-border rounded-lg p-12 text-center">
        <p className="text-text-muted text-[13px]">No sessions in B2 yet.</p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4">
        <SearchBar
          value={q}
          onChange={setQ}
          placeholder="Search projects by client, studio, date…"
        />
      </div>
      {filtered.length === 0 ? (
        <div className="bg-bg-elev border border-border rounded-lg px-5 py-8 text-center text-text-muted text-[13px]">
          Nothing matches &ldquo;{q}&rdquo;.
        </div>
      ) : (
        <div className="bg-bg-elev border border-border rounded-[16px] overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-text-muted text-[11px] uppercase tracking-wider border-b border-border">
                <th className="text-left p-4 font-medium">Session</th>
                <th className="text-left p-4 font-medium">Studio</th>
                <th className="text-left p-4 font-medium">Bucket</th>
                <th className="text-left p-4 font-medium">Client</th>
                <th className="text-left p-4 font-medium">Files</th>
                <th className="text-left p-4 font-medium">Size</th>
                <th className="text-left p-4 font-medium">Modified</th>
                <th className="text-right p-4 font-medium">Open</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={`${r.studio}/${r.bucket}/${r.folder}`}
                  className="border-b border-border last:border-0 hover:bg-bg-elev-2"
                >
                  <td className="p-4 font-medium">
                    {r.parsedDate ? `${r.parsedDate} ${r.parsedTime ?? ""}` : r.folder}
                  </td>
                  <td className="p-4">{r.studioLabel}</td>
                  <td className="p-4 text-text-muted">{r.bucketLabel}</td>
                  <td className="p-4 text-text-muted">{r.clientEmail ?? "—"}</td>
                  <td className="p-4">{r.fileCount}</td>
                  <td className="p-4">{fmtBytes(r.sizeBytes)}</td>
                  <td className="p-4 text-text-muted">
                    {r.lastModified
                      ? new Date(r.lastModified).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="p-4 text-right">
                    <Link
                      href={`/admin/studios/${r.studio}/${r.bucket}/${encodeURIComponent(r.folder)}`}
                      className="px-3 py-1.5 rounded-[8px] bg-bg-elev-3 border border-border text-[12px]"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
