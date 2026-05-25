"use client";

// Header button on /admin/studios — opens a small modal to create a
// new workspace. After creation we router.refresh() so the new tile
// appears in the grid.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal } from "@/components/Modal";

export function NewStudioButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [kind, setKind] = useState<"onpod" | "external">("external");
  const [autoSlug, setAutoSlug] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setDisplayName("");
    setSlug("");
    setKind("external");
    setAutoSlug(true);
    setError(null);
  };

  const close = () => {
    setOpen(false);
    setTimeout(reset, 200);
  };

  const slugify = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-+/g, "-");

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/studios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim(),
          slug: slug.trim().toLowerCase(),
          kind,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { message?: string }).message ?? `HTTP ${res.status}`,
        );
      }
      close();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 rounded-[10px] bg-accent text-white text-[13px] font-medium hover:opacity-90"
      >
        + New studio
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 rounded-[10px] bg-accent text-white text-[13px] font-medium hover:opacity-90"
      >
        + New studio
      </button>
      <Modal
        title="New studio workspace"
        subtitle="Creates a new top-level workspace. Sessions live at studios/{slug}/clients/{folder}/…"
        onClose={close}
        size="md"
        footer={
          <>
            <button
              onClick={close}
              className="px-4 py-2 text-text-muted hover:text-text"
            >
              Cancel
            </button>
            <button
              onClick={create}
              disabled={busy || !displayName.trim() || !slug.trim()}
              className="px-5 py-2.5 rounded-[10px] bg-accent text-white text-[13px] font-medium disabled:opacity-50"
            >
              {busy ? "Creating…" : "Create studio"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-[12px] text-text-muted mb-1">
              Display name *
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                if (autoSlug) setSlug(slugify(e.target.value));
              }}
              autoFocus
              placeholder="e.g. Toronto, Studio Smith, Vancouver Pop-up"
              className="w-full px-3 py-2 bg-bg-elev-2 border border-border rounded-[10px] text-[13px]"
            />
          </div>
          <div>
            <label className="block text-[12px] text-text-muted mb-1">
              Slug * <span className="text-text-dim">(lowercase, used in URLs)</span>
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) => {
                setAutoSlug(false);
                setSlug(slugify(e.target.value));
              }}
              placeholder="toronto"
              className="w-full px-3 py-2 bg-bg-elev-2 border border-border rounded-[10px] text-[13px] font-mono"
            />
            <p className="text-[11px] text-text-dim mt-1">
              Lives at <code className="text-accent-2">studios/{slug || "<slug>"}/</code> in B2.
            </p>
          </div>
          <div>
            <label className="block text-[12px] text-text-muted mb-1">Kind</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setKind("onpod")}
                className={
                  kind === "onpod"
                    ? "p-3 rounded-[10px] border border-accent bg-[rgba(255,59,48,0.08)] text-text text-left"
                    : "p-3 rounded-[10px] border border-border bg-bg-elev-2 text-text-muted hover:text-text hover:border-border-strong text-left"
                }
              >
                <div className="font-medium text-[13px]">OnPod workflow</div>
                <div className="text-[11px] text-text-dim mt-1">
                  Pearl + n8n create folders. Studio operator doesn&apos;t upload.
                </div>
              </button>
              <button
                type="button"
                onClick={() => setKind("external")}
                className={
                  kind === "external"
                    ? "p-3 rounded-[10px] border border-accent bg-[rgba(255,59,48,0.08)] text-text text-left"
                    : "p-3 rounded-[10px] border border-border bg-bg-elev-2 text-text-muted hover:text-text hover:border-border-strong text-left"
                }
              >
                <div className="font-medium text-[13px]">External</div>
                <div className="text-[11px] text-text-dim mt-1">
                  Studio operator + clients self-upload. Default for white-label sales.
                </div>
              </button>
            </div>
          </div>
          {error ? (
            <div className="p-3 rounded-[10px] bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-[12px] text-[#f87171]">
              {error}
            </div>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
