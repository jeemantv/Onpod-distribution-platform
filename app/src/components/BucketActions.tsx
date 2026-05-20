"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AssignDialog } from "./AssignDialog";
import { BUCKETS, type Bucket, type StudioSlug } from "@/lib/studio";

type Props = {
  studio: StudioSlug;
  bucket: Bucket;
  folder: string;
  isAdmin: boolean;
};

export function BucketActions({ studio, bucket, folder, isAdmin }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

  async function move(toBucket: Bucket) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromStudio: studio,
          fromBucket: bucket,
          toStudio: studio,
          toBucket,
          folder,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.message || "Move failed.");
        setBusy(false);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function hardDelete() {
    if (busy) return;
    if (!confirm(`Permanently delete "${folder}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studio, bucket, folder }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.message || "Delete failed.");
        setBusy(false);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const otherBuckets = BUCKETS.filter((b) => b !== bucket);

  return (
    <div className="inline-flex items-center gap-1">
      {bucket === "unmatched" ? (
        <button
          onClick={() => setAssignOpen(true)}
          disabled={busy}
          className="px-3 py-1.5 rounded-[8px] bg-accent text-white text-[12px] disabled:opacity-50"
        >
          Assign
        </button>
      ) : null}
      {!busy && (
        <select
          className="px-2 py-1.5 rounded-[8px] bg-bg-elev-3 border border-border text-[12px]"
          defaultValue=""
          onChange={(e) => {
            const v = e.target.value as Bucket;
            if (v) void move(v);
            e.currentTarget.value = "";
          }}
        >
          <option value="" disabled>
            Move to…
          </option>
          {otherBuckets.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      )}
      {isAdmin && bucket === "to-delete" ? (
        <button
          onClick={hardDelete}
          disabled={busy}
          className="px-3 py-1.5 rounded-[8px] bg-danger text-white text-[12px] disabled:opacity-50"
        >
          Delete
        </button>
      ) : null}
      <AssignDialog
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        studio={studio}
        folder={folder}
        onAssigned={() => router.refresh()}
      />
    </div>
  );
}
