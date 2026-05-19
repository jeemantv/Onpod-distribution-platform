"use client";

import { useEffect, useRef } from "react";
import type { FileType } from "@/lib/types";

const MOVE_TARGETS: { key: FileType; label: string }[] = [
  { key: "raw", label: "Raw Files" },
  { key: "edited", label: "Edited Podcast" },
  { key: "clip", label: "Clips" },
  { key: "asset", label: "Assets" },
];

export function FileContextMenu({
  x,
  y,
  selectedCount,
  onMove,
  onDelete,
  onSelectAll,
  onClose,
}: {
  x: number;
  y: number;
  selectedCount: number;
  onMove: (target: FileType) => void;
  onDelete: () => void;
  onSelectAll: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Constrain to viewport
  const safeX = Math.min(x, window.innerWidth - 240);
  const safeY = Math.min(y, window.innerHeight - 320);

  return (
    <div
      ref={ref}
      style={{ top: safeY, left: safeX }}
      className="fixed z-[200] w-[220px] bg-bg-elev-2 border border-border-strong rounded-[10px] shadow-modal py-1 text-[13px]"
    >
      <div className="px-3 py-2 text-[11px] text-text-muted border-b border-border">
        {selectedCount} file{selectedCount === 1 ? "" : "s"} selected
      </div>
      <div className="py-1 border-b border-border">
        <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-text-dim">
          Move to folder
        </div>
        {MOVE_TARGETS.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              onMove(t.key);
              onClose();
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-bg-elev-3 transition"
          >
            {t.label}
          </button>
        ))}
      </div>
      <button
        onClick={() => {
          onSelectAll();
          onClose();
        }}
        className="w-full text-left px-3 py-2 hover:bg-bg-elev-3 transition flex items-center justify-between"
      >
        Select all <span className="text-text-dim text-[11px]">⌘A</span>
      </button>
      <button
        onClick={() => {
          if (confirm(`Delete ${selectedCount} file(s)? This can't be undone.`)) {
            onDelete();
          }
          onClose();
        }}
        className="w-full text-left px-3 py-2 hover:bg-[rgba(239,68,68,0.12)] text-[#f87171] transition flex items-center justify-between"
      >
        Delete <span className="text-text-dim text-[11px]">⌫</span>
      </button>
    </div>
  );
}
