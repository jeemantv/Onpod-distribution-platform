"use client";

// Inline rename for a studio. Renders the display name + a pencil icon
// the admin can click to edit. Slug stays immutable (renaming it would
// orphan the B2 paths). Editor / non-admin sees the static label.

import { useRouter } from "next/navigation";
import { useState } from "react";

export function StudioNameEditor({
  slug,
  displayName,
  canEdit,
}: {
  slug: string;
  displayName: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(displayName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canEdit || !editing) {
    return (
      <div className="flex items-center gap-2">
        <h1 className="display text-[32px]">{displayName}</h1>
        {canEdit ? (
          <button
            onClick={() => {
              setValue(displayName);
              setEditing(true);
              setError(null);
            }}
            title="Rename studio"
            className="p-1.5 rounded-md text-text-muted hover:text-text hover:bg-bg-elev-2"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
          </button>
        ) : null}
      </div>
    );
  }

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      // Route lives at /api/admin/studios/[studio]/ — the param name was
      // forced by the existing nested bucket/folder routes.
      const res = await fetch(`/api/admin/studios/${encodeURIComponent(slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: value.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { message?: string }).message ?? `HTTP ${res.status}`);
      }
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
            else if (e.key === "Escape") setEditing(false);
          }}
          className="px-3 py-2 bg-bg-elev-2 border border-border rounded-[10px] text-[24px] display max-w-md"
        />
        <button
          onClick={save}
          disabled={busy || !value.trim() || value.trim() === displayName}
          className="px-4 py-2 rounded-[10px] bg-accent text-white text-[13px] font-medium disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          onClick={() => setEditing(false)}
          className="px-3 py-2 text-text-muted hover:text-text text-[13px]"
        >
          Cancel
        </button>
      </div>
      {error ? (
        <p className="text-[12px] text-danger">{error}</p>
      ) : (
        <p className="text-[11px] text-text-dim">
          Slug stays as <code className="text-accent-2">{slug}</code> — only the display name changes.
        </p>
      )}
    </div>
  );
}
