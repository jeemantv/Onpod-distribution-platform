"use client";

import { useEffect, useState } from "react";

export function ProjectMultiSelectBar() {
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (!t.matches("input[data-folder-checkbox]")) return;
      const id = t.dataset.folderCheckbox!;
      setSelected((prev) =>
        t.checked ? [...new Set([...prev, id])] : prev.filter((x) => x !== id),
      );
    };
    document.addEventListener("change", handler);
    return () => document.removeEventListener("change", handler);
  }, []);

  if (selected.length === 0) return null;

  const clear = () => {
    document
      .querySelectorAll<HTMLInputElement>("input[data-folder-checkbox]")
      .forEach((el) => (el.checked = false));
    setSelected([]);
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-bg-elev-2 border border-border-strong rounded-xl px-4 py-3 shadow-modal">
      <span className="text-[13px] font-medium">
        {selected.length} selected
      </span>
      <div className="w-px h-5 bg-border mx-2" />
      <button
        onClick={clear}
        className="px-3 py-1.5 rounded-[8px] text-[12px] text-text-muted hover:text-text"
      >
        Clear
      </button>
      <button className="px-3 py-1.5 rounded-[8px] bg-bg-elev border border-border hover:border-border-strong text-[12px]">
        Download all
      </button>
      <button className="px-3 py-1.5 rounded-[8px] bg-bg-elev border border-border hover:border-border-strong text-[12px]">
        Share
      </button>
      <button className="px-3 py-1.5 rounded-[8px] bg-bg-elev border border-border hover:border-border-strong text-[12px]">
        Archive
      </button>
    </div>
  );
}
