"use client";

// Filterable clients table. Search matches name, email, plan label.
// Memoizes the filter so typing stays snappy at hundreds of rows.

import Link from "next/link";
import { useMemo, useState } from "react";
import { SearchBar } from "@/components/SearchBar";

interface Row {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar: string;
  avatarColor: string;
  planLabel: string;
  planKey: string;
  sessionCount: number;
  totalFiles: number;
  totalSize: number;
  lastSession: string | null;
}

function fmtBytes(n: number): string {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function ClientsTable({ rows }: { rows: Row[] }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) =>
      [r.firstName, r.lastName, r.email, r.planLabel, r.planKey]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [rows, q]);

  if (rows.length === 0) {
    return (
      <div className="bg-bg-elev border border-border rounded-lg p-12 text-center">
        <p className="text-text-muted text-[13px]">No clients yet.</p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4">
        <SearchBar
          value={q}
          onChange={setQ}
          placeholder="Search clients by name, email, plan…"
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
                <th className="text-left p-4 font-medium">Client</th>
                <th className="text-left p-4 font-medium">Plan</th>
                <th className="text-left p-4 font-medium">Sessions</th>
                <th className="text-left p-4 font-medium">Files</th>
                <th className="text-left p-4 font-medium">Storage</th>
                <th className="text-left p-4 font-medium">Last activity</th>
                <th className="text-right p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-border last:border-0 hover:bg-bg-elev-2 cursor-pointer"
                >
                  <td className="p-0">
                    <Link href={`/admin/clients/${c.id}`} className="flex items-center gap-3 p-4">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center font-semibold text-[12px]"
                        style={{ background: c.avatarColor }}
                      >
                        {c.avatar}
                      </div>
                      <div>
                        <div className="font-medium">
                          {c.firstName} {c.lastName}
                        </div>
                        <div className="text-text-muted text-[11px]">{c.email}</div>
                      </div>
                    </Link>
                  </td>
                  <td className="p-0">
                    <Link href={`/admin/clients/${c.id}`} className="block p-4">
                      <span className="inline-block px-2.5 py-1 rounded-full bg-bg-elev-3 border border-border text-[11px]">
                        {c.planLabel}
                      </span>
                    </Link>
                  </td>
                  <td className="p-0">
                    <Link href={`/admin/clients/${c.id}`} className="block p-4">{c.sessionCount}</Link>
                  </td>
                  <td className="p-0">
                    <Link href={`/admin/clients/${c.id}`} className="block p-4">{c.totalFiles}</Link>
                  </td>
                  <td className="p-0">
                    <Link href={`/admin/clients/${c.id}`} className="block p-4">{fmtBytes(c.totalSize)}</Link>
                  </td>
                  <td className="p-0 text-text-muted">
                    <Link href={`/admin/clients/${c.id}`} className="block p-4">
                      {c.lastSession ? new Date(c.lastSession).toLocaleDateString() : "—"}
                    </Link>
                  </td>
                  <td className="p-0 text-right">
                    <Link
                      href={`/admin/clients/${c.id}`}
                      className="inline-block m-3 px-3 py-1.5 rounded-[8px] bg-bg-elev-3 border border-border text-[12px]"
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
