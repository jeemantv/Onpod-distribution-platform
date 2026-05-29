"use client";

// "Team access" card — multi-delegate invites. Each row gets a unique
// guest sign-in URL. Permissions: same as the host client (upload,
// publish, revise) minus billing and notification settings.

import { useEffect, useState } from "react";

interface Delegate {
  id: string;
  email: string;
  name: string;
  label: string | null;
  createdAt: string;
  guestUrl: string;
}

export function DelegatesCard() {
  const [list, setList] = useState<Delegate[] | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch("/api/account/delegates");
    const body = (await res.json().catch(() => ({}))) as { delegates?: Delegate[] };
    setList(body.delegates ?? []);
  };

  useEffect(() => {
    void load();
  }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/account/delegates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim(),
          label: label.trim() || undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        delegate?: Delegate;
        message?: string;
        error?: string;
      };
      if (!res.ok || !body.delegate) {
        throw new Error(body.message ?? body.error ?? `HTTP ${res.status}`);
      }
      setList((prev) => [...(prev ?? []), body.delegate!]);
      setEmail("");
      setName("");
      setLabel("");
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (d: Delegate) => {
    if (!confirm(`Revoke ${d.name}'s access? Their sign-in link will stop working immediately.`)) return;
    const res = await fetch(`/api/account/delegates/${d.id}`, { method: "DELETE" });
    if (res.ok) setList((prev) => (prev ?? []).filter((x) => x.id !== d.id));
  };

  const copy = async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <section className="mb-5 p-6 rounded-[16px] bg-bg-elev border border-border">
      <h2 className="display text-[18px] mb-1">Team access</h2>
      <p className="text-text-muted text-[12px] mb-4">
        Invite teammates (social media manager, assistant, etc.) to your
        account. They get a permanent sign-in link and can upload, publish,
        and manage files — but can&apos;t touch billing, plan, or notification
        settings. You can revoke their access any time.
      </p>

      {list && list.length > 0 ? (
        <ul className="space-y-2 mb-5">
          {list.map((d) => (
            <li
              key={d.id}
              className="p-3 rounded-[10px] bg-bg-elev-2 border border-border"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium">
                    {d.name}
                    {d.label ? (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-text-dim">
                        {d.label}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-[12px] text-text-muted">{d.email}</div>
                </div>
                <button
                  type="button"
                  onClick={() => revoke(d)}
                  className="px-3 py-1.5 rounded-[8px] text-[11px] text-text-muted hover:text-danger"
                >
                  Revoke
                </button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 text-[10px] bg-bg border border-border rounded-[6px] px-2 py-1 font-mono truncate">
                  {d.guestUrl}
                </code>
                <button
                  type="button"
                  onClick={() => copy(d.id, d.guestUrl)}
                  className="px-2.5 py-1 rounded-[6px] bg-bg-elev-3 border border-border text-[11px] shrink-0"
                >
                  {copied === d.id ? "✓" : "Copy"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : list && list.length === 0 ? (
        <p className="text-[12px] text-text-dim mb-4">No teammates yet.</p>
      ) : (
        <p className="text-[12px] text-text-dim mb-4">Loading…</p>
      )}

      <details>
        <summary className="cursor-pointer text-[12px] text-text-muted mb-2">
          + Add teammate
        </summary>
        <form onSubmit={add} className="mt-3 space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (e.g. Maria Lopez)"
            className="w-full px-3 py-2 bg-bg-elev-2 border border-border rounded-[10px] text-[13px]"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="maria@example.com"
            className="w-full px-3 py-2 bg-bg-elev-2 border border-border rounded-[10px] text-[13px]"
          />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Role label (optional, e.g. Social media manager)"
            className="w-full px-3 py-2 bg-bg-elev-2 border border-border rounded-[10px] text-[13px]"
          />
          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={busy || !email.trim() || !name.trim()}
              className="px-4 py-2 rounded-[10px] bg-accent text-white text-[13px] disabled:opacity-50"
            >
              {busy ? "Adding…" : "Send invite link"}
            </button>
            {err ? <span className="text-[12px] text-danger">{err}</span> : null}
          </div>
        </form>
      </details>
    </section>
  );
}
