"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SearchBar } from "@/components/SearchBar";

interface Row {
  slug: string;
  displayName: string;
  totalSessions: number;
  totalBytes: number;
}

function fmtBytes(n: number): string {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function StudiosList({ rows }: { rows: Row[] }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) =>
      [r.slug, r.displayName].join(" ").toLowerCase().includes(t),
    );
  }, [rows, q]);

  return (
    <>
      <div className="mb-4">
        <SearchBar
          value={q}
          onChange={setQ}
          placeholder="Search studios by name…"
        />
      </div>
      {filtered.length === 0 ? (
        <div className="bg-bg-elev border border-border rounded-lg px-5 py-8 text-center text-text-muted text-[13px]">
          {q ? `Nothing matches "${q}".` : "No studios."}
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((s) => (
            <li key={s.slug}>
              <Link
                href={`/admin/studios/${s.slug}`}
                className="group flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 sm:py-4 bg-bg-elev border border-border rounded-lg hover:border-border-strong hover:bg-bg-elev-2 transition"
              >
                <div className="w-10 h-10 rounded-md bg-bg-elev-3 flex items-center justify-center text-text-muted shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-[13px] sm:text-[14px]">{s.displayName}</div>
                  <p className="text-[11px] sm:text-[12px] text-text-muted mt-1">
                    {s.totalSessions} sessions · {fmtBytes(s.totalBytes)}
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
