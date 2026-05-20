"use client";

import { useEffect, useMemo, useState } from "react";
import type { StudioSlug } from "@/lib/studio";

interface UserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

type Props = {
  open: boolean;
  onClose: () => void;
  studio: StudioSlug;
  folder: string;
  onAssigned: () => void;
};

export function AssignDialog({ open, onClose, studio, folder, onAssigned }: Props) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualEmail, setManualEmail] = useState("");

  useEffect(() => {
    if (!open) return;
    void (async () => {
      try {
        const res = await fetch("/api/admin/users");
        const data = await res.json();
        setUsers(data.users ?? []);
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }, [open]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return users.slice(0, 20);
    return users
      .filter(
        (u) =>
          u.email.toLowerCase().includes(term) ||
          `${u.firstName} ${u.lastName}`.toLowerCase().includes(term),
      )
      .slice(0, 20);
  }, [users, q]);

  async function assign(email: string) {
    if (!email) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studio, folder, email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Assign failed.");
        setBusy(false);
        return;
      }
      onAssigned();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div
        className="bg-bg-elev border border-border rounded-[16px] w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[20px] font-semibold mb-2">Assign session</h2>
        <p className="text-text-muted text-[12px] mb-4">
          Folder will be renamed to embed the client&apos;s email and moved into
          the studio&apos;s <code className="text-accent-2">clients/</code> bucket.
        </p>

        <input
          type="search"
          placeholder="Search by name or email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
          className="w-full px-4 py-2.5 bg-bg-elev-2 border border-border rounded-[10px] text-[13px] focus:outline-none focus:border-border-strong"
        />

        <div className="mt-3 max-h-60 overflow-y-auto border border-border rounded-[10px] divide-y divide-border">
          {filtered.length === 0 ? (
            <div className="p-4 text-[12px] text-text-muted">No matches.</div>
          ) : (
            filtered.map((u) => (
              <button
                key={u.id}
                disabled={busy}
                onClick={() => void assign(u.email)}
                className="w-full text-left p-3 hover:bg-bg-elev-2 disabled:opacity-50 flex items-center justify-between"
              >
                <span className="text-[13px]">
                  {u.firstName} {u.lastName}
                  <span className="text-text-muted ml-2 text-[11px]">{u.email}</span>
                </span>
                <span className="text-text-dim text-[11px]">{u.role}</span>
              </button>
            ))
          )}
        </div>

        <div className="mt-4 border-t border-border pt-4">
          <label className="text-[11px] text-text-muted">
            Or assign to an email that doesn&apos;t have an account yet:
          </label>
          <div className="flex items-center gap-2 mt-2">
            <input
              type="email"
              placeholder="client@example.com"
              value={manualEmail}
              onChange={(e) => setManualEmail(e.target.value)}
              className="flex-1 px-3 py-2 bg-bg-elev-2 border border-border rounded-[8px] text-[13px] focus:outline-none focus:border-border-strong"
            />
            <button
              disabled={busy || !manualEmail.includes("@")}
              onClick={() => void assign(manualEmail.trim().toLowerCase())}
              className="px-3 py-2 rounded-[8px] bg-accent text-white text-[12px] disabled:opacity-50"
            >
              Assign
            </button>
          </div>
        </div>

        {error ? <p className="text-[12px] text-danger mt-3">{error}</p> : null}

        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-[8px] bg-bg-elev-3 border border-border text-[12px]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
