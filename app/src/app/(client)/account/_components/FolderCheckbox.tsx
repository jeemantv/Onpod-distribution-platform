"use client";

export function FolderCheckbox({ projectId }: { projectId: string }) {
  return (
    <input
      type="checkbox"
      onClick={(e) => e.stopPropagation()}
      className="accent-accent w-4 h-4"
      data-folder-checkbox={projectId}
      aria-label="Select folder"
    />
  );
}
