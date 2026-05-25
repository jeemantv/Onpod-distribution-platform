"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SearchBar } from "@/components/SearchBar";

interface Row {
  studio: string;
  studioLabel: string;
  folder: string;
  parsedDate?: string;
  parsedTime?: string;
  parsedEmail?: string;
  fileCount: number;
  sizeBytes: number;
  lastModified: string | null;
  editorName?: string;
  editorEmail?: string;
  reviewOpen: number;
  reviewTotal: number;
}

function fmtBytes(n: number): string {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function EditsList({ rows }: { rows: Row[] }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) =>
      [
        r.folder,
        r.studio,
        r.studioLabel,
        r.parsedDate ?? "",
        r.parsedTime ?? "",
        r.parsedEmail ?? "",
        r.editorName ?? "",
        r.editorEmail ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(t),
    );
  }, [rows, q]);

  if (rows.length === 0) {
    return (
      <div className="bg-bg-elev border border-border rounded-lg p-12 text-center">
        <p className="text-text-muted text-[13px]">
          Nothing in your queue yet. Ask an admin to assign you a studio.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4">
        <SearchBar
          value={q}
          onChange={setQ}
          placeholder="Search edits by client, studio, date, editor…"
        />
      </div>
      {filtered.length === 0 ? (
        <div className="bg-bg-elev border border-border rounded-lg px-5 py-8 text-center text-text-muted text-[13px]">
          Nothing matches &ldquo;{q}&rdquo;.
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((s) => (
            <li key={`${s.studio}/${s.folder}`}>
              <Link
                href={`/admin/studios/${s.studio}/clients/${encodeURIComponent(s.folder)}`}
                className="block px-4 py-3 bg-bg-elev border border-border rounded-lg hover:border-border-strong hover:bg-bg-elev-2 transition"
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="w-10 h-10 rounded-md bg-bg-elev-3 flex items-center justify-center text-text-muted shrink-0">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[13px]">
                      {s.parsedDate ? `${s.parsedDate} ${s.parsedTime ?? ""}` : s.folder} — {s.studioLabel}
                    </div>
                    <p className="text-[11px] text-text-muted mt-0.5">
                      {s.parsedEmail ?? "—"} · {s.fileCount} files · {fmtBytes(s.sizeBytes)}
                      {s.lastModified ? (
                        <> · {new Date(s.lastModified).toLocaleDateString()}</>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                    {s.editorName ? (
                      <span
                        className="px-2 py-0.5 rounded-[6px] text-[11px] bg-bg-elev-3 text-text-muted border border-border"
                        title={s.editorEmail}
                      >
                        Editor: {s.editorName}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-[6px] text-[11px] bg-bg-elev-3 text-text-dim border border-border">
                        Editor: unassigned
                      </span>
                    )}
                    {s.reviewTotal > 0 ? (
                      <span
                        className={
                          s.reviewOpen > 0
                            ? "px-2 py-0.5 rounded-[6px] text-[11px] bg-[rgba(245,158,11,0.12)] text-[#f59e0b] border border-[rgba(245,158,11,0.3)]"
                            : "px-2 py-0.5 rounded-[6px] text-[11px] bg-[rgba(16,185,129,0.12)] text-[#10b981] border border-[rgba(16,185,129,0.3)]"
                        }
                      >
                        {s.reviewOpen > 0
                          ? `${s.reviewOpen} open note${s.reviewOpen === 1 ? "" : "s"}`
                          : `Review done (${s.reviewTotal})`}
                      </span>
                    ) : null}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
