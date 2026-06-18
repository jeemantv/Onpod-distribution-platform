"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
  done: boolean;
  archived: boolean;
}

function fmtBytes(n: number): string {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// Shared row-action buttons. Posts the new state, then refreshes the
// server component so the row moves in/out of the archive view.
function RowActions({ row, variant }: { row: Row; variant: "active" | "archive" }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function update(patch: { done?: boolean; archived?: boolean }, key: string) {
    setBusy(key);
    try {
      const res = await fetch("/api/admin/sessions/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studio: row.studio,
          bucket: row.bucket,
          folder: row.folder,
          ...patch,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (err) {
      console.error("session state update failed", err);
      alert("Couldn't update the project. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  const btn =
    "px-2.5 py-1.5 rounded-[8px] border border-border text-[12px] disabled:opacity-50";

  if (variant === "archive") {
    return (
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={() => update({ archived: false }, "unarchive")}
          disabled={busy !== null}
          className={`${btn} bg-bg-elev-3`}
        >
          {busy === "unarchive" ? "…" : "Unarchive"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <button
        onClick={() => update({ done: !row.done }, "done")}
        disabled={busy !== null}
        className={`${btn} ${row.done ? "bg-[rgba(16,185,129,0.15)] text-[#34d399]" : "bg-bg-elev-3"}`}
        title={row.done ? "Mark as not done" : "Mark as done"}
      >
        {busy === "done" ? "…" : row.done ? "✓ Done" : "Mark done"}
      </button>
      <button
        onClick={() => update({ archived: true }, "archive")}
        disabled={busy !== null}
        className={`${btn} bg-bg-elev-3`}
      >
        {busy === "archive" ? "…" : "Archive"}
      </button>
    </div>
  );
}

export function ProjectsTable({
  rows,
  variant = "active",
}: {
  rows: Row[];
  variant?: "active" | "archive";
}) {
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
        <p className="text-text-muted text-[13px]">
          {variant === "archive" ? "No archived projects." : "No sessions in B2 yet."}
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
          placeholder="Search projects by client, studio, date…"
        />
      </div>
      {filtered.length === 0 ? (
        <div className="bg-bg-elev border border-border rounded-lg px-5 py-8 text-center text-text-muted text-[13px]">
          Nothing matches &ldquo;{q}&rdquo;.
        </div>
      ) : (
        <div className="bg-bg-elev border border-border rounded-[16px] overflow-hidden overflow-x-auto">
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
                <th className="text-right p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={`${r.studio}/${r.bucket}/${r.folder}`}
                  className="border-b border-border last:border-0 hover:bg-bg-elev-2"
                >
                  <td className="p-4 font-medium">
                    <span className="inline-flex items-center gap-2">
                      {r.parsedDate ? `${r.parsedDate} ${r.parsedTime ?? ""}` : r.folder}
                      {r.done ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[rgba(16,185,129,0.15)] text-[#34d399]">
                          <span className="w-[5px] h-[5px] rounded-full bg-current" />
                          Done
                        </span>
                      ) : null}
                    </span>
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
                  <td className="p-4 text-right">
                    <RowActions row={r} variant={variant} />
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
