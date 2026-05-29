"use client";

// Small inline form on /admin/settings. Type an address → fire a test
// email via /api/admin/test-email. Surfaces the actual result (sent,
// sandbox fallback, send_failed with the Resend error message).

import { useState } from "react";

export function SendTestEmail() {
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    | { ok: true; message: string; sandboxMode: boolean }
    | { ok: false; message: string }
    | null
  >(null);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: to.trim() }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        sandboxMode?: boolean;
      };
      if (!res.ok || !body.ok) {
        setResult({
          ok: false,
          message: body.message ?? `HTTP ${res.status}`,
        });
      } else {
        setResult({
          ok: true,
          message: body.message ?? "Sent.",
          sandboxMode: !!body.sandboxMode,
        });
      }
    } catch (err) {
      setResult({ ok: false, message: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 p-4 rounded-[12px] bg-bg-elev-2 border border-border">
      <div className="text-[12px] font-medium mb-1">Send a test email</div>
      <p className="text-[11px] text-text-muted mb-3">
        Fires through the same Resend pipeline every real flow uses
        (magic links, approval requests, etc). Use it after rotating keys
        or verifying a new sender domain.
      </p>
      <form onSubmit={send} className="flex items-center gap-2 flex-wrap">
        <input
          type="email"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="recipient@example.com"
          className="flex-1 min-w-[200px] px-3 py-2 bg-bg-elev-3 border border-border rounded-[8px] text-[13px]"
          required
        />
        <button
          type="submit"
          disabled={busy || !to.trim()}
          className="px-4 py-2 rounded-[8px] bg-accent text-white text-[13px] disabled:opacity-50"
        >
          {busy ? "Sending…" : "Send test"}
        </button>
      </form>
      {result ? (
        <div
          className={`mt-3 p-3 rounded-[8px] text-[11px] ${
            result.ok
              ? result.sandboxMode
                ? "bg-[rgba(245,158,11,0.08)] border border-[rgba(245,158,11,0.25)] text-[#fbbf24]"
                : "bg-[rgba(16,185,129,0.08)] border border-[rgba(16,185,129,0.25)] text-[#34d399]"
              : "bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.25)] text-[#f87171]"
          }`}
        >
          {result.message}
        </div>
      ) : null}
    </div>
  );
}
