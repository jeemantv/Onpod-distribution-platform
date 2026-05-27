"use client";

// Studio admin settings: shareable signup invites. Lives on
// /admin/studios/[studio]. Scoped admins can edit only their own
// studios (server enforces this via loadEditorScope).
//
// The legacy per-studio "Payment URL" field was removed — OnPod now
// owns billing centrally; studios earn free storage instead.

import { useRouter } from "next/navigation";
import { useState } from "react";

interface InviteRow {
  id: string;
  token: string;
  label: string | null;
  createdAt: string | Date;
  usedCount: number;
  lastUsedAt: string | Date | null;
  revokedAt: string | Date | null;
}

export function StudioSettingsPanel({
  slug,
  initialInvites,
  origin,
  editors = [],
  initialDefaultEditor = null,
}: {
  slug: string;
  initialInvites: InviteRow[];
  origin: string;
  editors?: { email: string; name: string }[];
  initialDefaultEditor?: string | null;
}) {
  const [defaultEditor, setDefaultEditor] = useState<string | null>(initialDefaultEditor);
  const [editorSaving, setEditorSaving] = useState(false);
  const [editorSavedAt, setEditorSavedAt] = useState<number | null>(null);

  const saveDefaultEditor = async (email: string | null) => {
    const previous = defaultEditor;
    setDefaultEditor(email);
    setEditorSaving(true);
    const res = await fetch(`/api/admin/studios/${slug}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaultEditorEmail: email }),
    }).catch(() => null);
    setEditorSaving(false);
    if (!res || !res.ok) {
      setDefaultEditor(previous);
      const txt = (await res?.text().catch(() => "")) ?? "";
      alert(`Couldn't save default editor. ${txt.slice(0, 200)}`);
      return;
    }
    setEditorSavedAt(Date.now());
    setTimeout(() => setEditorSavedAt(null), 2000);
  };
  const router = useRouter();
  const [invites, setInvites] = useState<InviteRow[]>(initialInvites);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  // `copied` tracks the most recently-copied identifier. We tag with a
  // suffix so the URL-copy and embed-copy buttons don't collide.
  const inviteUrl = (token: string) =>
    `${origin}/invite/${encodeURIComponent(token)}`;
  const embedCode = (token: string) =>
    `<iframe src="${inviteUrl(token)}" style="width:100%;max-width:480px;height:600px;border:0;background:#0a0a0b;border-radius:12px" loading="lazy" title="Sign up"></iframe>`;

  const generate = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/studios/${slug}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert((data as { message?: string }).message ?? `HTTP ${res.status}`);
        return;
      }
      setInvites((prev) => [data.invite, ...prev]);
      setLabel("");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (inviteId: string) => {
    if (!confirm("Revoke this invite link? Existing copies will stop working.")) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/studios/${slug}/invites/${inviteId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        alert(`Revoke failed (${res.status})`);
        return;
      }
      setInvites((prev) =>
        prev.map((inv) =>
          inv.id === inviteId ? { ...inv, revokedAt: new Date() } : inv,
        ),
      );
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const copy = async (token: string, mode: "url" | "embed") => {
    try {
      const text = mode === "url" ? inviteUrl(token) : embedCode(token);
      await navigator.clipboard.writeText(text);
      setCopied(`${token}:${mode}`);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked */
    }
  };


  return (
    <div className="space-y-6">
      <section className="p-6 rounded-[16px] bg-bg-elev border border-border">
        <h2 className="display text-[18px] mb-1">Default editor</h2>
        <p className="text-text-muted text-[12px] mb-4">
          Every new client created in this studio gets this editor assigned
          automatically. They can still be reassigned later from the Clients
          tab. Leave blank to skip auto-assignment.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={defaultEditor ?? ""}
            disabled={editorSaving}
            onChange={(e) => void saveDefaultEditor(e.target.value || null)}
            className="flex-1 min-w-[200px] max-w-[400px] bg-bg-elev-2 border border-border rounded-[10px] px-3 py-2 text-[13px]"
          >
            <option value="">— none (no auto-assignment) —</option>
            {editors.map((ed) => (
              <option key={ed.email} value={ed.email}>
                {ed.name} · {ed.email}
              </option>
            ))}
          </select>
          {editorSaving ? (
            <span className="text-[11px] text-text-muted">Saving…</span>
          ) : editorSavedAt ? (
            <span className="text-[11px] text-success">Saved ✓</span>
          ) : null}
        </div>
      </section>

      <section className="p-6 rounded-[16px] bg-bg-elev border border-border">
        <h2 className="display text-[18px] mb-1">Signup invite links</h2>
        <p className="text-text-muted text-[12px] mb-4">
          Share these URLs with prospective clients (embed on your site, drop
          in DMs). When someone signs up via the link, they&apos;re created as
          a client in this studio.
        </p>

        <div className="flex items-center gap-2 mb-4">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Optional label (e.g. Q2 landing page)"
            className="flex-1 px-3 py-2 bg-bg-elev-2 border border-border rounded-[10px] text-[13px]"
          />
          <button
            onClick={generate}
            disabled={busy}
            className="px-4 py-2 rounded-[10px] bg-accent text-white text-[13px] font-medium disabled:opacity-50"
          >
            {busy ? "…" : "+ Generate link"}
          </button>
        </div>

        {invites.length === 0 ? (
          <p className="text-text-dim text-[12px]">No invite links yet.</p>
        ) : (
          <ul className="space-y-2">
            {invites.map((inv) => {
              const revoked = !!inv.revokedAt;
              return (
                <li
                  key={inv.id}
                  className={`flex items-center gap-3 px-3 py-2 border border-border rounded-[10px] ${revoked ? "opacity-50" : ""}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] truncate">
                      {inv.label || <span className="text-text-dim">unlabeled</span>}
                    </div>
                    <div className="text-[11px] text-text-muted font-mono truncate">
                      {inviteUrl(inv.token)}
                    </div>
                    <div className="text-[10px] text-text-dim mt-0.5">
                      {inv.usedCount} signups
                      {inv.lastUsedAt
                        ? ` · last ${new Date(inv.lastUsedAt).toLocaleDateString()}`
                        : ""}
                      {revoked ? " · revoked" : ""}
                    </div>
                  </div>
                  {!revoked ? (
                    <>
                      <button
                        onClick={() => copy(inv.token, "url")}
                        title="Copy the public signup URL"
                        className="px-3 py-1.5 rounded-[8px] bg-bg-elev-3 border border-border text-[12px]"
                      >
                        {copied === `${inv.token}:url` ? "✓" : "Copy URL"}
                      </button>
                      <button
                        onClick={() => copy(inv.token, "embed")}
                        title="Copy <iframe> code to embed on a Squarespace / Webflow / WordPress site"
                        className="px-3 py-1.5 rounded-[8px] bg-bg-elev-3 border border-border text-[12px]"
                      >
                        {copied === `${inv.token}:embed` ? "✓" : "Embed"}
                      </button>
                      <button
                        onClick={() => revoke(inv.id)}
                        className="px-3 py-1.5 rounded-[8px] border border-border text-text-muted hover:text-danger text-[12px]"
                      >
                        Revoke
                      </button>
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

    </div>
  );
}
