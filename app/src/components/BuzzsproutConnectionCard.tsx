"use client";

import { useEffect, useState } from "react";

interface Status {
  connected: boolean;
  podcastId?: string;
  episodeCount?: number;
  stale?: boolean;
  error?: string;
}

export function BuzzsproutConnectionCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [podcastId, setPodcastId] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const refresh = async () => {
    const res = await fetch("/api/buzzsprout/status");
    setStatus((await res.json().catch(() => ({ connected: false }))) as Status);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const connect = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setOk(false);
    try {
      const res = await fetch("/api/buzzsprout/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ podcastId: podcastId.trim(), token: token.trim() }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        throw new Error(body.message ?? body.error ?? `HTTP ${res.status}`);
      }
      setOk(true);
      setToken("");
      await refresh();
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!confirm("Disconnect Buzzsprout? Future episodes will fall back to the manual Spotify RSS flow.")) return;
    await fetch("/api/buzzsprout/disconnect", { method: "POST" });
    await refresh();
  };

  return (
    <section className="p-5 bg-bg-elev border border-border rounded-[12px]">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-[16px] font-medium">Buzzsprout integration</h2>
          <p className="text-[11px] text-text-muted mt-0.5">
            Connect your Buzzsprout podcast to publish episodes from OnPod with one click. Buzzsprout distributes to Spotify, Apple, Amazon Music, and every other directory you link.
          </p>
        </div>
        <a
          href="/docs/podcast-setup"
          target="_blank"
          rel="noreferrer"
          className="text-[11px] underline text-text-muted whitespace-nowrap"
        >
          Setup + pricing guide →
        </a>
      </div>

      {status?.connected ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 rounded-[10px] bg-[rgba(16,185,129,0.08)] border border-[rgba(16,185,129,0.25)]">
            <span className="w-2 h-2 rounded-full bg-[#34d399]" />
            <div className="flex-1 text-[12px]">
              Connected to podcast{" "}
              <code className="text-accent-2">#{status.podcastId}</code>
              {status.episodeCount != null
                ? ` — ${status.episodeCount} episode${status.episodeCount === 1 ? "" : "s"} live`
                : null}
              {status.stale ? (
                <span className="ml-2 text-[#fbbf24]">
                  Token may be stale ({status.error})
                </span>
              ) : null}
            </div>
            <button
              onClick={disconnect}
              className="px-3 py-1.5 rounded-[8px] text-[11px] text-text-muted hover:text-danger"
            >
              Disconnect
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={connect} className="space-y-3">
          <Field label="Podcast ID (numeric — from your buzzsprout.com/<id> URL)">
            <input
              required
              value={podcastId}
              onChange={(e) => setPodcastId(e.target.value)}
              placeholder="e.g. 2364712"
              className="input"
            />
          </Field>
          <Field label="API token (Buzzsprout dashboard → Settings → Buzzsprout API)">
            <input
              required
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="paste token"
              className="input"
              autoComplete="off"
            />
          </Field>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={busy || !podcastId.trim() || !token.trim()}
              className="px-4 py-2 rounded-[10px] bg-accent text-white text-[13px] disabled:opacity-50"
            >
              {busy ? "Verifying…" : "Connect Buzzsprout"}
            </button>
            {ok ? <span className="text-[12px] text-success">Connected ✓</span> : null}
            {err ? <span className="text-[12px] text-danger">{err}</span> : null}
          </div>
        </form>
      )}

      <style jsx>{`
        .input {
          width: 100%;
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          font-size: 13px;
          color: inherit;
        }
        .input:focus {
          outline: none;
          border-color: rgba(255, 255, 255, 0.25);
        }
      `}</style>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] text-text-muted mb-1">{label}</span>
      {children}
    </label>
  );
}
