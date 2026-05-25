"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface StudioOption {
  slug: string;
  displayName: string;
}

export function WorkspaceSettings({
  clientId,
  currentHomeStudio,
  currentSelfUpload,
  studios,
}: {
  clientId: string;
  currentHomeStudio: string | null;
  currentSelfUpload: boolean;
  // DB-backed list from /lib/studio-registry; the parent page passes
  // this in so newly-created studios show up immediately.
  studios: StudioOption[];
}) {
  const router = useRouter();
  const [homeStudio, setHomeStudio] = useState<string>(currentHomeStudio ?? "");
  const [selfUploadEnabled, setSelfUploadEnabled] = useState(currentSelfUpload);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty =
    homeStudio !== (currentHomeStudio ?? "") || selfUploadEnabled !== currentSelfUpload;

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homeStudio: homeStudio || null,
          selfUploadEnabled,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { message?: string }).message ?? `HTTP ${res.status}`);
      }
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-[12px] text-text-muted mb-1">Home studio (workspace)</label>
        <select
          value={homeStudio}
          onChange={(e) => {
            const next = e.target.value;
            setHomeStudio(next);
            setSaved(false);
            if (next === "externals" && !selfUploadEnabled) setSelfUploadEnabled(true);
          }}
          className="px-3 py-2 bg-bg-elev-2 border border-border rounded-[10px] text-[13px] min-w-[260px]"
        >
          <option value="">— None (legacy) —</option>
          {studios.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.displayName}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-text-dim mt-1">
          Where their session folders live. Externals = website signups + manual invites.
          OnPod studios are fed by n8n / Pearl.
        </p>
      </div>

      <label className="flex items-center gap-2 text-[13px] cursor-pointer select-none">
        <input
          type="checkbox"
          checked={selfUploadEnabled}
          onChange={(e) => {
            setSelfUploadEnabled(e.target.checked);
            setSaved(false);
          }}
          className="accent-accent w-4 h-4"
        />
        <span>Let this client upload their own videos</span>
      </label>
      <p className="text-[11px] text-text-dim -mt-2 ml-6">
        Shows a drag-drop uploader inside their session pages.
      </p>

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="px-4 py-2 rounded-[10px] bg-accent text-white text-[13px] font-medium disabled:opacity-50"
        >
          {saving ? "Saving…" : saved ? "✓ Saved" : "Save"}
        </button>
        {dirty && !saving ? (
          <span className="text-[11px] text-text-muted">Unsaved changes</span>
        ) : null}
      </div>

      {error ? (
        <div className="p-3 rounded-[10px] bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-[12px] text-[#f87171]">
          {error}
        </div>
      ) : null}
    </div>
  );
}
