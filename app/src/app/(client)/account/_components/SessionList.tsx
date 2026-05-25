"use client";

// Client-side filterable sessions list. Server passes a serialised
// snapshot (with studio LABELS resolved already so we don't bundle the
// studio-registry into the client). Search matches folder, date, time,
// parsed email, and studio name.

import Link from "next/link";
import { useMemo, useState } from "react";

interface SessionRow {
  studio: string;
  studioLabel: string;
  folder: string;
  parsed: { date: string; time: string; email?: string } | null;
  fileCount: number;
  sizeBytes: number;
  lastModified: string | null;
}

function fmtBytes(n: number): string {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function SessionList({ sessions }: { sessions: SessionRow[] }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => {
      const hay = [
        s.folder,
        s.studio,
        s.studioLabel,
        s.parsed?.date ?? "",
        s.parsed?.time ?? "",
        s.parsed?.email ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [sessions, query]);

  if (sessions.length === 0) {
    return (
      <div className="bg-bg-elev border border-border rounded-lg p-12 text-center">
        <p className="text-text-muted">
          No sessions yet. New recordings will appear here after your next OnPod session.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4 relative">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim pointer-events-none"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search sessions, dates, studios…"
          className="w-full pl-10 pr-3 py-2.5 bg-bg-elev border border-border rounded-[10px] text-[13px] placeholder:text-text-dim focus:outline-none focus:border-border-strong"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="bg-bg-elev border border-border rounded-lg px-5 py-8 text-center text-text-muted text-[13px]">
          Nothing matches &ldquo;{query}&rdquo;.
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((s) => (
            <li key={`${s.studio}/${s.folder}`}>
              <Link
                href={`/account/sessions/${s.studio}/${encodeURIComponent(s.folder)}`}
                className="group flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 sm:py-4 bg-bg-elev border border-border rounded-lg hover:border-border-strong hover:bg-bg-elev-2 transition"
              >
                <div className="w-10 h-10 rounded-md bg-bg-elev-3 flex items-center justify-center text-text-muted shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-[13px] sm:text-[14px]">
                    {s.parsed ? `${s.parsed.date} ${s.parsed.time}` : s.folder} — {s.studioLabel}
                  </div>
                  <p className="text-[11px] sm:text-[12px] text-text-muted mt-1">
                    {s.fileCount} files · {fmtBytes(s.sizeBytes)}
                    {s.lastModified ? (
                      <> · {new Date(s.lastModified).toLocaleDateString()}</>
                    ) : null}
                  </p>
                </div>
                <span className="text-text-dim group-hover:text-text shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
