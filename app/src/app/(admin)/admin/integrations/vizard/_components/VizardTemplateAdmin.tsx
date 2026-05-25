"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Template {
  id: string;
  name: string;
  previewUrl: string | null;
  sourceConfig: boolean;
  lockCode: string | null;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function VizardTemplateAdmin({ initial }: { initial: Template[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Template[]>(initial);
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newFile, setNewFile] = useState<File | null>(null);
  const [newPreviewUrl, setNewPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveName(t: Template, name: string) {
    setBusy(t.id);
    setError(null);
    try {
      const res = await fetch("/api/admin/vizard-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: t.id, name }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { message?: string }).message ?? `HTTP ${res.status}`);
      }
      setRows((prev) => prev.map((r) => (r.id === t.id ? { ...r, name } : r)));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function uploadImage(t: Template, file: File) {
    setBusy(t.id);
    setError(null);
    try {
      const base64 = await fileToBase64(file);
      const res = await fetch("/api/admin/vizard-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: t.id, imageBase64: base64 }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { message?: string }).message ?? `HTTP ${res.status}`);
      }
      const d = (await res.json()) as { previewUrl: string | null };
      const stamped = d.previewUrl ? `${d.previewUrl}&t=${Date.now()}` : null;
      setRows((prev) => prev.map((r) => (r.id === t.id ? { ...r, previewUrl: stamped } : r)));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function saveLockCode(t: Template, lockCode: string | null) {
    setBusy(t.id);
    setError(null);
    try {
      const res = await fetch("/api/admin/vizard-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: t.id, lockCode }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { message?: string }).message ?? `HTTP ${res.status}`);
      }
      setRows((prev) => prev.map((r) => (r.id === t.id ? { ...r, lockCode } : r)));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(t: Template) {
    if (!confirm(`Remove the override for ${t.name}? (Static config row stays unless removed from vizard-templates.ts.)`)) return;
    setBusy(t.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/vizard-template?templateId=${encodeURIComponent(t.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function addNew() {
    const id = newId.trim();
    if (!id) return;
    if (rows.find((r) => r.id === id)) {
      setError(`Template ${id} already in the list.`);
      return;
    }
    setBusy("__new__");
    setError(null);
    try {
      // Single POST carries id + name + (optional) image. Backend
      // upserts everything in one row.
      const imageBase64 = newFile ? await fileToBase64(newFile) : undefined;
      const res = await fetch("/api/admin/vizard-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: id,
          name: newName.trim() || id,
          imageBase64,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { message?: string }).message ?? `HTTP ${res.status}`);
      }
      const d = (await res.json().catch(() => ({}))) as {
        previewUrl?: string | null;
      };
      setRows((prev) => [
        ...prev,
        {
          id,
          name: newName.trim() || id,
          previewUrl: d.previewUrl
            ? `${d.previewUrl}&t=${Date.now()}`
            : null,
          sourceConfig: false,
          lockCode: null,
        },
      ]);
      // Clear the form.
      setNewId("");
      setNewName("");
      setNewFile(null);
      if (newPreviewUrl) URL.revokeObjectURL(newPreviewUrl);
      setNewPreviewUrl(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function pickFile(file: File | null) {
    if (newPreviewUrl) URL.revokeObjectURL(newPreviewUrl);
    setNewFile(file);
    setNewPreviewUrl(file ? URL.createObjectURL(file) : null);
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="p-3 rounded-[8px] bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-[12px] text-[#f87171]">
          {error}
        </div>
      ) : null}

      <ul className="space-y-3">
        {rows.map((t) => (
          <li
            key={t.id}
            className="flex items-center gap-4 p-3 bg-bg-elev border border-border rounded-[12px]"
          >
            <div className="w-24 aspect-video rounded-[8px] overflow-hidden bg-bg-elev-3 shrink-0">
              {t.previewUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={t.previewUrl} alt={t.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-text-dim text-[10px] px-2 text-center">
                  No preview
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <div className="text-[10px] text-text-dim font-mono">{t.id}</div>
              <input
                defaultValue={t.name}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== t.name) void saveName(t, v);
                }}
                className="w-full px-3 py-2 bg-bg-elev-2 border border-border rounded-[8px] text-[13px]"
                placeholder="Display name"
              />
              <LockEditor template={t} onSave={saveLockCode} busy={busy === t.id} />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <label className="px-3 py-2 rounded-[8px] bg-bg-elev-2 border border-border text-[12px] cursor-pointer hover:border-border-strong">
                {busy === t.id ? "Uploading…" : "Upload image"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadImage(t, f);
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                onClick={() => void remove(t)}
                disabled={busy === t.id}
                className="px-3 py-2 rounded-[8px] bg-bg-elev-2 border border-border text-[12px] text-text-muted hover:text-danger hover:border-border-strong"
              >
                {t.sourceConfig ? "Reset" : "Remove"}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="p-5 bg-bg-elev border border-border rounded-[12px]">
        <div className="text-[14px] font-medium mb-1">Add new template</div>
        <p className="text-[11px] text-text-dim mb-4">
          Saves to all OnPod accounts — clients see it instantly in their
          Clips modal&apos;s Vizard tab.
        </p>

        <div className="grid sm:grid-cols-[200px_1fr] gap-4">
          {/* Preview / file picker */}
          <label className="aspect-[9/16] rounded-[10px] overflow-hidden bg-bg-elev-2 border border-border-strong border-dashed flex items-center justify-center cursor-pointer hover:bg-bg-elev-3 transition">
            {newPreviewUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={newPreviewUrl}
                alt="Preview"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="text-center px-2">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="mx-auto text-text-dim mb-2"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <div className="text-[11px] text-text-muted">Click to upload</div>
                <div className="text-[10px] text-text-dim mt-1">9:16 preview</div>
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
          </label>

          {/* Fields */}
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] text-text-muted mb-1">
                Vizard template ID *
              </label>
              <input
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                placeholder="e.g. 91261482"
                className="w-full px-3 py-2 bg-bg-elev-2 border border-border rounded-[8px] text-[13px] font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] text-text-muted mb-1">
                Display name
              </label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Yellow pop"
                className="w-full px-3 py-2 bg-bg-elev-2 border border-border rounded-[8px] text-[13px]"
              />
              <p className="text-[10px] text-text-dim mt-1">
                Defaults to the ID if left blank.
              </p>
            </div>
            <button
              onClick={() => void addNew()}
              disabled={!newId.trim() || busy === "__new__"}
              className="w-full sm:w-auto px-5 py-2.5 rounded-[10px] bg-accent text-white text-[13px] font-medium disabled:opacity-50"
            >
              {busy === "__new__" ? "Saving…" : "Add template"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Code + explicit Lock / Unlock button. Saves only on click — onBlur
// raced with focus changes which made saves look like they weren't
// persisting.
function LockEditor({
  template,
  onSave,
  busy,
}: {
  template: Template;
  onSave: (t: Template, code: string | null) => Promise<void>;
  busy: boolean;
}) {
  const [code, setCode] = useState(template.lockCode ?? "");
  const [savedTick, setSavedTick] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const isLocked = !!template.lockCode;

  // Keep input in sync when parent state changes (e.g. after save).
  useEffect(() => {
    setCode(template.lockCode ?? "");
  }, [template.lockCode]);

  const doLock = async () => {
    setErr(null);
    if (!/^\d{4}$/.test(code)) {
      setErr("Code must be exactly 4 digits.");
      return;
    }
    await onSave(template, code);
    setSavedTick((t) => t + 1);
  };
  const doUnlock = async () => {
    setErr(null);
    await onSave(template, null);
    setCode("");
    setSavedTick((t) => t + 1);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[11px] text-text-muted">Lock code</span>
      <input
        type="text"
        inputMode="numeric"
        maxLength={4}
        value={code}
        onChange={(e) => {
          setCode(e.target.value.replace(/\D/g, "").slice(0, 4));
          setErr(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") void doLock();
        }}
        placeholder="••••"
        disabled={busy}
        className="w-24 px-3 py-1.5 bg-bg-elev-2 border border-border rounded-[8px] text-[13px] font-mono tracking-[0.3em] text-center disabled:opacity-50"
      />
      <button
        type="button"
        onClick={() => void doLock()}
        disabled={busy || code.length !== 4 || code === (template.lockCode ?? "")}
        className="px-3 py-1.5 rounded-[8px] bg-[rgba(245,158,11,0.15)] border border-[rgba(245,158,11,0.4)] text-[#fbbf24] text-[12px] font-medium disabled:opacity-40"
        title="Save code"
      >
        {busy ? "…" : "🔒 Lock"}
      </button>
      {isLocked ? (
        <button
          type="button"
          onClick={() => void doUnlock()}
          disabled={busy}
          className="px-3 py-1.5 rounded-[8px] bg-bg-elev-2 border border-border text-[12px] text-text-muted hover:text-text disabled:opacity-40"
          title="Remove lock code"
        >
          Unlock
        </button>
      ) : null}
      <span
        className={`text-[10px] ${isLocked ? "text-[#fbbf24]" : "text-text-dim"}`}
      >
        {isLocked ? "🔒 Locked" : "Unlocked"}
      </span>
      {savedTick > 0 && !busy ? (
        <span key={savedTick} className="text-[10px] text-[#34d399]">✓ Saved</span>
      ) : null}
      {err ? <span className="text-[10px] text-danger">{err}</span> : null}
    </div>
  );
}
