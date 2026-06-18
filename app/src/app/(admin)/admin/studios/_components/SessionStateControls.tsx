"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Mark done / archive controls for a single B2 session, shown in the
// session ("project") header. Mirrors the row actions on /admin/projects
// but for the page you're currently viewing.
export function SessionStateControls({
  studio,
  bucket,
  folder,
  done: initialDone,
  archived: initialArchived,
}: {
  studio: string;
  bucket: string;
  folder: string;
  done: boolean;
  archived: boolean;
}) {
  const router = useRouter();
  const [done, setDone] = useState(initialDone);
  const [archived, setArchived] = useState(initialArchived);
  const [busy, setBusy] = useState<string | null>(null);

  async function update(patch: { done?: boolean; archived?: boolean }, key: string) {
    setBusy(key);
    try {
      const res = await fetch("/api/admin/sessions/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studio, bucket, folder, ...patch }),
      });
      if (!res.ok) throw new Error(await res.text());
      if (typeof patch.done === "boolean") setDone(patch.done);
      if (typeof patch.archived === "boolean") setArchived(patch.archived);
      router.refresh();
    } catch (err) {
      console.error("session state update failed", err);
      alert("Couldn't update the project. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  const btn =
    "px-3 py-1.5 rounded-[8px] border border-border text-[12px] font-medium disabled:opacity-50";

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => update({ done: !done }, "done")}
        disabled={busy !== null}
        className={`${btn} ${done ? "bg-[rgba(16,185,129,0.15)] text-[#34d399]" : "bg-bg-elev-3"}`}
      >
        {busy === "done" ? "…" : done ? "✓ Done" : "Mark done"}
      </button>
      <button
        onClick={() => update({ archived: !archived }, "archive")}
        disabled={busy !== null}
        className={`${btn} ${archived ? "bg-[rgba(245,158,11,0.15)] text-[#fbbf24]" : "bg-bg-elev-3"}`}
      >
        {busy === "archive" ? "…" : archived ? "Unarchive" : "Archive"}
      </button>
    </div>
  );
}
