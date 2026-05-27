"use client";

// Monday.com-style status pill: click to open a colored-options popover.
// Clients can pick; editors/admins can also rename, recolor, delete,
// reorder, and add new options inline. Edits go straight to
// /api/file-statuses and propagate to every other instance of this
// dropdown on the next render (the list is fetched per-studio, shared
// across rows via the parent).

import { useEffect, useRef, useState } from "react";
import type { FileStatus } from "@/lib/file-statuses-store";

const PALETTE: string[] = [
  "#6b7280", // gray
  "#ef4444", // red
  "#f97316", // orange
  "#f59e0b", // amber
  "#eab308", // yellow
  "#84cc16", // lime
  "#10b981", // green
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#a855f7", // purple
  "#ec4899", // pink
  "#f43f5e", // rose
];

export function StatusDropdown({
  statuses,
  currentId,
  // Legacy mapping fallback: if currentId is null but legacyValue matches
  // one of the statuses, show that one selected.
  legacyValue,
  inRevision,
  canEdit,
  onChange,
  onCreate,
  onUpdate,
  onDelete,
}: {
  statuses: FileStatus[];
  currentId: string | null;
  legacyValue?: string | null;
  // When the file has open revision notes, override the visual to show
  // "In revision" (amber). Editor still selects via the dropdown.
  inRevision?: boolean;
  canEdit: boolean;
  onChange: (statusId: string | null) => void;
  onCreate: (label: string, color: string) => Promise<void>;
  onUpdate: (id: string, patch: { label?: string; color?: string }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setEditing(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setEditing(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current =
    statuses.find((s) => s.id === currentId) ??
    (legacyValue
      ? statuses.find((s) => s.legacyValue === legacyValue) ?? null
      : null) ??
    statuses.find((s) => s.isDefault) ??
    statuses[0] ??
    null;

  const displayColor = inRevision ? "#f59e0b" : current?.color ?? "#6b7280";
  const displayLabel = inRevision ? "In revision" : current?.label ?? "Set status";

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={inRevision ? "There are open revision notes on this file" : "Change status"}
        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-[8px] border text-[12px] font-medium transition shrink-0 sm:w-[170px]"
        style={{
          backgroundColor: hexA(displayColor, 0.12),
          borderColor: hexA(displayColor, 0.35),
          color: displayColor,
        }}
      >
        <span className="w-[6px] h-[6px] rounded-full" style={{ backgroundColor: displayColor }} />
        <span className="truncate">{displayLabel}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="opacity-70">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+4px)] z-40 w-[260px] rounded-[10px] bg-bg-elev border border-border shadow-xl overflow-hidden">
          <ul className="max-h-[280px] overflow-y-auto p-1">
            {statuses.map((s) => (
              <li key={s.id}>
                {editing === s.id ? (
                  <InlineEditor
                    status={s}
                    busy={busy}
                    onSave={async (patch) => {
                      setBusy(true);
                      await onUpdate(s.id, patch);
                      setBusy(false);
                      setEditing(null);
                    }}
                    onCancel={() => setEditing(null)}
                    onDelete={async () => {
                      if (!confirm(`Delete the "${s.label}" status?`)) return;
                      setBusy(true);
                      await onDelete(s.id);
                      setBusy(false);
                      setEditing(null);
                    }}
                  />
                ) : (
                  <div className="flex items-center gap-1 group">
                    <button
                      type="button"
                      onClick={() => {
                        onChange(s.id);
                        setOpen(false);
                      }}
                      className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-[6px] hover:bg-bg-elev-2 text-left"
                    >
                      <span
                        className="inline-block w-[10px] h-[10px] rounded-sm"
                        style={{ backgroundColor: s.color }}
                      />
                      <span className="text-[12px] flex-1 truncate" style={{ color: s.color }}>
                        {s.label}
                      </span>
                      {current?.id === s.id ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-text-muted">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : null}
                    </button>
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => setEditing(s.id)}
                        className="opacity-0 group-hover:opacity-100 px-1.5 py-1 text-text-muted hover:text-text"
                        aria-label="Edit status"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                    ) : null}
                  </div>
                )}
              </li>
            ))}
          </ul>

          {canEdit ? (
            <Adder
              busy={busy}
              onAdd={async (label, color) => {
                setBusy(true);
                await onCreate(label, color);
                setBusy(false);
              }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function InlineEditor({
  status,
  busy,
  onSave,
  onCancel,
  onDelete,
}: {
  status: FileStatus;
  busy: boolean;
  onSave: (patch: { label?: string; color?: string }) => Promise<void>;
  onCancel: () => void;
  onDelete: () => Promise<void>;
}) {
  const [label, setLabel] = useState(status.label);
  const [color, setColor] = useState(status.color);
  return (
    <div className="px-2 py-2 bg-bg-elev-2 rounded-[6px]">
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="w-full mb-2 px-2 py-1.5 text-[12px] bg-bg-elev-3 border border-border rounded-[6px]"
        autoFocus
      />
      <Swatches selected={color} onSelect={setColor} />
      <div className="flex items-center gap-1 mt-2">
        <button
          type="button"
          onClick={() => void onSave({ label: label.trim(), color })}
          disabled={busy || !label.trim()}
          className="flex-1 px-2 py-1 text-[11px] rounded-[6px] bg-accent text-white disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-2 py-1 text-[11px] text-text-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void onDelete()}
          disabled={busy}
          className="px-2 py-1 text-[11px] text-danger hover:underline disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function Adder({
  busy,
  onAdd,
}: {
  busy: boolean;
  onAdd: (label: string, color: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [color, setColor] = useState(PALETTE[8]);
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full px-3 py-2 text-[12px] text-text-muted hover:text-text border-t border-border text-left flex items-center gap-1.5"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Add status
      </button>
    );
  }
  return (
    <div className="px-2 py-2 border-t border-border bg-bg-elev-2">
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Status name"
        className="w-full mb-2 px-2 py-1.5 text-[12px] bg-bg-elev-3 border border-border rounded-[6px]"
        autoFocus
      />
      <Swatches selected={color} onSelect={setColor} />
      <div className="flex items-center gap-1 mt-2">
        <button
          type="button"
          onClick={async () => {
            if (!label.trim()) return;
            await onAdd(label.trim(), color);
            setLabel("");
            setOpen(false);
          }}
          disabled={busy || !label.trim()}
          className="flex-1 px-2 py-1 text-[11px] rounded-[6px] bg-accent text-white disabled:opacity-50"
        >
          Add
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setLabel("");
          }}
          className="px-2 py-1 text-[11px] text-text-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function Swatches({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (color: string) => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onSelect(c)}
          className="w-5 h-5 rounded-full border-2 transition"
          style={{
            backgroundColor: c,
            borderColor: selected === c ? "#fafafa" : "transparent",
          }}
          aria-label={`Use color ${c}`}
        />
      ))}
    </div>
  );
}

function hexA(hex: string, alpha: number): string {
  // Quick #rrggbb → rgba() with the supplied alpha. Falls back to the
  // raw input on anything non-#rrggbb so non-standard inputs survive.
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
