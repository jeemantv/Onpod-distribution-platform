"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import type { FileItem } from "@/lib/types";
import { SpotifyModal } from "./SpotifyModal";

interface ConnectionStatus {
  connected: boolean;
  podcastId?: string;
  episodeCount?: number;
  recent?: { id: number; title: string; publishedAt: string | null; private: boolean }[];
  stale?: boolean;
  error?: string;
}

type Tab = "buzzsprout" | "rss";

export function BuzzsproutModal({
  fileId,
  file,
  aiReady,
  onClose,
}: {
  fileId: string;
  file: FileItem;
  aiReady: boolean;
  onClose: () => void;
}) {
  void aiReady;
  const [tab, setTab] = useState<Tab>("buzzsprout");
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [summary, setSummary] = useState("");
  const [tags, setTags] = useState("");
  const [seasonNumber, setSeasonNumber] = useState("");
  const [episodeNumber, setEpisodeNumber] = useState("");
  const [draft, setDraft] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    id: number;
    title: string;
    private: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [statusRes, aiRes] = await Promise.all([
        fetch("/api/buzzsprout/status"),
        fetch(`/api/transcribe/${fileId}/status?include=data`),
      ]);
      const s = (await statusRes.json().catch(() => ({}))) as ConnectionStatus;
      const a = (await aiRes.json().catch(() => ({}))) as {
        ai?: {
          title?: string;
          description?: string;
          summary?: string;
          tags?: string[];
        };
      };
      if (cancelled) return;
      setStatus(s);
      if (a.ai) {
        setTitle(a.ai.title ?? file.name.replace(/\.\w+$/, ""));
        setDescription(a.ai.description ?? "");
        setSummary(a.ai.summary ?? (a.ai.description?.slice(0, 280) ?? ""));
        setTags(a.ai.tags?.join(", ") ?? "");
      } else {
        setTitle(file.name.replace(/\.\w+$/, ""));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileId, file.name]);

  const publish = async () => {
    setPublishing(true);
    setError(null);
    try {
      const res = await fetch("/api/buzzsprout/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId,
          title,
          description,
          summary,
          tags,
          privateEpisode: draft,
          seasonNumber: seasonNumber ? Number(seasonNumber) : undefined,
          episodeNumber: episodeNumber ? Number(episodeNumber) : undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        episode?: { id: number; title: string; private: boolean };
        error?: string;
        message?: string;
      };
      if (!res.ok || !body.ok || !body.episode) {
        throw new Error(body.message ?? body.error ?? `HTTP ${res.status}`);
      }
      setSuccess(body.episode);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPublishing(false);
    }
  };

  if (tab === "rss") {
    return <SpotifyModal fileId={fileId} file={file} aiReady={aiReady} onClose={onClose} />;
  }

  if (success) {
    return (
      <Modal title="Sent to Buzzsprout" subtitle={file.name} onClose={onClose} size="lg">
        <div className="text-center py-4">
          <div className="inline-flex w-14 h-14 rounded-full bg-[rgba(16,185,129,0.15)] text-[#34d399] items-center justify-center mb-4">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <p className="text-[15px] mb-2 font-medium">{success.title}</p>
          <p className="text-[12px] text-text-muted mb-4">
            {success.private
              ? "Saved as a private draft on Buzzsprout. Publish it from your dashboard when ready."
              : "Published — Buzzsprout is now distributing to Spotify, Apple, Amazon Music, and the rest of your linked directories."}
          </p>
          <a
            href={`https://www.buzzsprout.com/${status?.podcastId}/episodes/${success.id}`}
            target="_blank"
            rel="noreferrer"
            className="inline-block px-4 py-2 rounded-[10px] bg-bg-elev-3 border border-border-strong text-[12px]"
          >
            Open on Buzzsprout →
          </a>
          <div className="mt-6">
            <button onClick={onClose} className="px-4 py-2 rounded-[8px] bg-bg-elev-3 border border-border-strong text-[13px]">
              Close
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Publish to Buzzsprout"
      subtitle={file.name}
      onClose={onClose}
      size="lg"
      footer={
        status?.connected ? (
          <>
            <button onClick={onClose} className="px-4 py-2 text-text-muted hover:text-text">
              Cancel
            </button>
            <button
              disabled={publishing || !title.trim()}
              onClick={publish}
              className="px-5 py-2.5 rounded-[10px] bg-accent text-white text-[13px] font-medium disabled:opacity-60"
            >
              {publishing ? "Sending…" : draft ? "Save as draft" : "Publish now"}
            </button>
          </>
        ) : (
          <button onClick={onClose} className="px-4 py-2 text-text-muted hover:text-text">
            Close
          </button>
        )
      }
    >
      <Tabs current={tab} onChange={setTab} />

      {!status ? (
        <div className="text-[13px] text-text-muted py-10 text-center">Loading…</div>
      ) : !status.connected ? (
        <NotConnectedPanel />
      ) : (
        <div className="space-y-5">
          <div className="p-4 bg-bg-elev-2 border border-border rounded-[12px] flex items-center gap-3 text-[12px]">
            <span className="inline-flex w-2 h-2 rounded-full bg-[#34d399]" />
            <span className="flex-1">
              Connected to Buzzsprout podcast{" "}
              <code className="text-accent-2">#{status.podcastId}</code>
              {status.episodeCount != null
                ? ` — ${status.episodeCount} episode${status.episodeCount === 1 ? "" : "s"} live`
                : null}
              {status.stale ? " (token may be stale)" : null}
            </span>
            <a href="/settings/podcast" className="text-text-muted underline text-[11px]">
              Settings
            </a>
          </div>

          <div>
            <Label>Episode title</Label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="input-bz" />
          </div>
          <div>
            <Label>Show notes / description</Label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={5}
              className="input-bz"
            />
          </div>
          <div>
            <Label>Short summary (≤280 chars, used in some directories)</Label>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={2}
              maxLength={280}
              className="input-bz"
            />
          </div>
          <div>
            <Label>Tags (comma-separated)</Label>
            <input value={tags} onChange={(e) => setTags(e.target.value)} className="input-bz" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Season</Label>
              <input
                value={seasonNumber}
                onChange={(e) => setSeasonNumber(e.target.value)}
                className="input-bz"
              />
            </div>
            <div>
              <Label>Episode</Label>
              <input
                value={episodeNumber}
                onChange={(e) => setEpisodeNumber(e.target.value)}
                className="input-bz"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-[12px] text-text-muted">
            <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} />
            Save as private draft (publish manually from Buzzsprout later)
          </label>

          {error ? (
            <div className="mt-4 p-3 rounded-[10px] bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-[12px] text-[#f87171]">
              {error}
            </div>
          ) : null}
        </div>
      )}

      <style jsx>{`
        :global(.input-bz) {
          width: 100%;
          padding: 10px 14px;
          background: #1c1c20;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          color: #fafafa;
          font-family: inherit;
          font-size: 13px;
        }
      `}</style>
    </Modal>
  );
}

function NotConnectedPanel() {
  return (
    <div className="space-y-4 py-2">
      <div className="p-5 rounded-[12px] bg-bg-elev-2 border border-border">
        <h3 className="text-[14px] font-medium mb-2">Buzzsprout isn&apos;t connected yet</h3>
        <p className="text-[12px] text-text-muted leading-relaxed mb-4">
          Once you connect a Buzzsprout podcast in settings, every episode you
          publish here goes live on Spotify, Apple Podcasts, Amazon Music,
          Pocket Casts, and the rest of your linked directories automatically.
        </p>
        <div className="flex items-center gap-2">
          <a
            href="/settings/podcast"
            className="px-4 py-2 rounded-[10px] bg-accent text-white text-[12px] font-medium"
          >
            Connect Buzzsprout →
          </a>
          <a
            href="/docs/podcast-setup"
            target="_blank"
            rel="noreferrer"
            className="px-4 py-2 rounded-[10px] bg-bg-elev-3 border border-border-strong text-[12px]"
          >
            Setup guide + pricing
          </a>
        </div>
      </div>
      <div className="p-4 rounded-[12px] bg-bg border border-border text-[12px] text-text-muted leading-relaxed">
        <strong className="text-text">Want a free path?</strong> Switch to the{" "}
        <em>Spotify (manual RSS)</em> tab above. We&apos;ll generate an RSS
        feed you submit once to each directory — no Buzzsprout subscription
        needed.
      </div>
    </div>
  );
}

function Tabs({ current, onChange }: { current: Tab; onChange: (t: Tab) => void }) {
  return (
    <div className="flex items-center gap-1 mb-5 p-1 bg-bg-elev-2 rounded-[10px] w-fit">
      <TabBtn active={current === "buzzsprout"} onClick={() => onChange("buzzsprout")}>
        Buzzsprout · auto
      </TabBtn>
      <TabBtn active={current === "rss"} onClick={() => onChange("rss")}>
        Spotify · manual (free)
      </TabBtn>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-[8px] text-[12px] transition ${
        active
          ? "bg-bg-elev-3 text-text border border-border-strong"
          : "text-text-muted hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-[12px] text-text-muted mb-2">{children}</label>;
}
