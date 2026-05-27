"use client";

// "Your video editor" card. Clients (especially external/self-upload
// workspaces) paste their freelance editor's email + name; OnPod
// generates a permanent guest URL the editor uses to sign in. Access
// includes the same client UI the host sees, so the editor can leave
// revision notes and upload new versions on this client's files.

import { useEffect, useState } from "react";

interface Loaded {
  editor: { email: string; name: string } | null;
  guestUrl?: string;
}

export function ExternalEditorCard() {
  const [data, setData] = useState<Loaded | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    const res = await fetch("/api/account/external-editor");
    const body = (await res.json().catch(() => ({}))) as Loaded;
    setData(body);
    if (body.editor) {
      setEmail(body.editor.email);
      setName(body.editor.name);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/account/external-editor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), name: name.trim() }),
      });
      const body = (await res.json().catch(() => ({}))) as Loaded & {
        message?: string;
        error?: string;
      };
      if (!res.ok || !body.editor) {
        throw new Error(body.message ?? body.error ?? `HTTP ${res.status}`);
      }
      setData(body);
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!confirm("Revoke your editor's guest access? Their current link will stop working.")) return;
    await fetch("/api/account/external-editor", { method: "DELETE" });
    setEmail("");
    setName("");
    setData({ editor: null });
  };

  const copyUrl = async () => {
    if (!data?.guestUrl) return;
    try {
      await navigator.clipboard.writeText(data.guestUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <section className="mb-6 p-6 rounded-[16px] bg-bg-elev border border-border">
      <h2 className="text-[16px] font-medium mb-1">Your video editor</h2>
      <p className="text-text-muted text-[12px] mb-4">
        If you work with a freelance editor, give them their own guest
        sign-in. They can view your files, leave revision notes, and
        upload edited cuts as new versions — all without an OnPod account.
        Revision-request emails go to them automatically.
      </p>

      {data?.editor ? (
        <div className="space-y-4">
          <div className="p-4 rounded-[12px] bg-bg-elev-2 border border-border">
            <div className="text-[13px] font-medium">{data.editor.name}</div>
            <div className="text-[12px] text-text-muted">{data.editor.email}</div>
          </div>
          {data.guestUrl ? (
            <div className="p-3 rounded-[10px] bg-bg-elev-2 border border-border">
              <div className="text-[11px] text-text-muted mb-1.5">
                Their sign-in link (send this to them once):
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-[11px] bg-bg border border-border rounded-[6px] px-2 py-1.5 font-mono truncate">
                  {data.guestUrl}
                </code>
                <button
                  type="button"
                  onClick={copyUrl}
                  className="px-3 py-1.5 rounded-[8px] bg-bg-elev-3 border border-border text-[12px]"
                >
                  {copied ? "✓" : "Copy"}
                </button>
              </div>
            </div>
          ) : null}
          <details className="text-[12px]">
            <summary className="cursor-pointer text-text-muted">Change editor or revoke access</summary>
            <form onSubmit={save} className="mt-3 space-y-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Editor name"
                className="w-full px-3 py-2 bg-bg-elev-2 border border-border rounded-[8px] text-[13px]"
              />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="editor@example.com"
                className="w-full px-3 py-2 bg-bg-elev-2 border border-border rounded-[8px] text-[13px]"
              />
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="px-3 py-1.5 rounded-[8px] bg-accent text-white text-[12px] disabled:opacity-50"
                >
                  {busy ? "Saving…" : "Update"}
                </button>
                <button
                  type="button"
                  onClick={revoke}
                  className="px-3 py-1.5 rounded-[8px] text-[12px] text-danger hover:underline"
                >
                  Revoke access
                </button>
              </div>
              {err ? <p className="text-[11px] text-danger">{err}</p> : null}
            </form>
          </details>
        </div>
      ) : (
        <form onSubmit={save} className="space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Editor name (e.g. Sarah Lopez)"
            className="w-full px-3 py-2 bg-bg-elev-2 border border-border rounded-[10px] text-[13px]"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="editor@example.com"
            className="w-full px-3 py-2 bg-bg-elev-2 border border-border rounded-[10px] text-[13px]"
          />
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={busy || !email.trim() || !name.trim()}
              className="px-4 py-2 rounded-[10px] bg-accent text-white text-[13px] disabled:opacity-50"
            >
              {busy ? "Saving…" : "Invite my editor"}
            </button>
            {err ? <span className="text-[12px] text-danger">{err}</span> : null}
          </div>
        </form>
      )}
    </section>
  );
}
