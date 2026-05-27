"use client";

// Renders the manual Spotify RSS publish flow inline (no Modal wrapper),
// so it can be embedded as a tab inside BuzzsproutModal. Handles its own
// state + push action; the parent only owns the modal frame + tabs.

import { useEffect, useState } from "react";
import type { FileItem } from "@/lib/types";

interface ShowConfig {
  slug: string;
  title: string;
  description: string;
  author: string;
  authorEmail: string;
  language: string;
  categoryItunes: string;
  coverUrl: string;
}

export function SpotifyRssPanel({
  fileId,
  file,
  onClose,
}: {
  fileId: string;
  file: FileItem;
  onClose: () => void;
}) {
  void file;
  const [show, setShow] = useState<ShowConfig | null>(null);
  const [feedUrl, setFeedUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [season, setSeason] = useState("");
  const [episode, setEpisode] = useState("");
  const [pushing, setPushing] = useState(false);
  const [hasAI, setHasAI] = useState<boolean | null>(null);
  const [success, setSuccess] = useState<{ feedUrl: string; count: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [showRes, statusRes] = await Promise.all([
        fetch("/api/rss/show"),
        fetch(`/api/transcribe/${fileId}/status?include=data`),
      ]);
      const showBody = (await showRes.json()) as { show: ShowConfig | null };
      const statusBody = (await statusRes.json().catch(() => ({}))) as {
        hasAI?: boolean;
        ai?: { title: string; description: string };
      };
      if (cancelled) return;
      setHasAI(!!statusBody.hasAI);
      if (showBody.show) {
        setShow(showBody.show);
        setFeedUrl(`${window.location.origin}/feeds/${showBody.show.slug}.xml`);
      }
      // Only prefill from AI when AI exists. No "fallback to filename" —
      // that produces title strings like "edited_v2_take_3" which
      // clients have to delete anyway. Empty + a clear "No transcript"
      // warning is the cleaner default.
      if (statusBody.ai) {
        setTitle(statusBody.ai.title);
        setDescription(statusBody.ai.description);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileId, file.name]);

  const saveShow = async (next: ShowConfig) => {
    const res = await fetch("/api/rss/show", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    const body = (await res.json()) as { show: ShowConfig };
    setShow(body.show);
    setFeedUrl(`${window.location.origin}/feeds/${body.show.slug}.xml`);
  };

  const push = async () => {
    setPushing(true);
    setError(null);
    try {
      const res = await fetch("/api/rss/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId,
          title,
          description,
          season: season ? Number(season) : undefined,
          episode: episode ? Number(episode) : undefined,
        }),
      });
      if (!res.ok)
        throw new Error(((await res.json()) as { message?: string }).message ?? `HTTP ${res.status}`);
      const body = (await res.json()) as { feedUrl: string; episodeCount: number };
      setSuccess({ feedUrl: body.feedUrl, count: body.episodeCount });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPushing(false);
    }
  };

  if (success) {
    return (
      <div className="text-center py-4">
        <div className="inline-flex w-14 h-14 rounded-full bg-[rgba(16,185,129,0.15)] text-[#34d399] items-center justify-center mb-4">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <p className="text-[14px] mb-2">
          {success.count} episode{success.count === 1 ? "" : "s"} live in your feed
        </p>
        <p className="text-[12px] text-text-muted mb-1">Public feed URL:</p>
        <code className="block px-3 py-2 bg-bg-elev-2 border border-border rounded-[8px] text-[12px] text-accent-2 break-all">
          {success.feedUrl}
        </code>
        <div className="mt-5 text-left text-[12px] text-text-muted space-y-2">
          <p className="font-medium text-text">Next steps:</p>
          <p>
            1. Open{" "}
            <a className="text-accent underline" target="_blank" rel="noreferrer" href="https://podcasters.spotify.com">
              Spotify for Podcasters
            </a>{" "}
            → Add show → &quot;I already have a podcast&quot; → paste the feed URL above. Spotify emails a verification code.
          </p>
          <p>
            2. Open{" "}
            <a className="text-accent underline" target="_blank" rel="noreferrer" href="https://podcastsconnect.apple.com">
              Apple Podcasts Connect
            </a>{" "}
            → New Show → &quot;Add a show with an RSS feed&quot;.
          </p>
          <p>
            3. Repeat for any other directory you want (Overcast, Pocket Casts, Amazon Music, etc.). Future episodes auto-distribute.
          </p>
        </div>
        <div className="mt-6">
          <button onClick={onClose} className="px-4 py-2 rounded-[8px] bg-bg-elev-3 border border-border-strong text-[13px]">
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {hasAI === false ? (
        <div className="mb-5 p-3 rounded-[10px] bg-[rgba(245,158,11,0.08)] border border-[rgba(245,158,11,0.25)] text-[12px] text-[#fbbf24]">
          <strong>No transcript yet.</strong> Title + description are empty
          until you generate one — close this and click the AI button on
          the file row first, or type them manually below.
        </div>
      ) : null}

      <div className="mb-5 p-4 bg-bg-elev-2 border border-border rounded-[12px]">
        <div className="text-[12px] text-text-muted mb-2">Your podcast feed URL</div>
        {feedUrl ? (
          <code className="block px-3 py-2 bg-bg-elev-3 rounded-[8px] text-[12px] text-accent-2 break-all">
            {feedUrl}
          </code>
        ) : (
          <div className="text-[12px] text-text-dim">Saving feed config…</div>
        )}
        <p className="mt-3 text-[11px] text-text-muted">
          Paste this URL once into Spotify for Podcasters, Apple Podcasts Connect, Overcast, etc. Every push you make from here updates the feed and all directories pick up new episodes automatically.
        </p>
      </div>

      {show ? (
        <ShowEditor show={show} onChange={(next) => void saveShow({ ...show, ...next })} />
      ) : null}

      <div className="grid grid-cols-1 gap-4 mt-5">
        <div>
          <Label>Episode title</Label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="input-sp" />
        </div>
        <div>
          <Label>Description</Label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            className="input-sp"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Season</Label>
            <input value={season} onChange={(e) => setSeason(e.target.value)} className="input-sp" />
          </div>
          <div>
            <Label>Episode number</Label>
            <input value={episode} onChange={(e) => setEpisode(e.target.value)} className="input-sp" />
          </div>
        </div>
      </div>

      {error ? (
        <div className="mt-4 p-3 rounded-[10px] bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-[12px] text-[#f87171]">
          {error}
        </div>
      ) : null}

      <div className="mt-6 flex items-center justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 text-text-muted hover:text-text">
          Cancel
        </button>
        <button
          disabled={pushing || !title.trim()}
          onClick={push}
          className="px-5 py-2.5 rounded-[10px] bg-accent text-white text-[13px] font-medium disabled:opacity-60"
        >
          {pushing ? "Pushing…" : "Push to feed"}
        </button>
      </div>

      <style jsx>{`
        :global(.input-sp) {
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
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-[12px] text-text-muted mb-2">{children}</label>;
}

function ShowEditor({
  show,
  onChange,
}: {
  show: ShowConfig;
  onChange: (next: Partial<ShowConfig>) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
      className="bg-bg-elev-2 border border-border rounded-[12px] p-4"
    >
      <summary className="text-[13px] cursor-pointer">
        Show settings — {show.title}
      </summary>
      <div className="grid grid-cols-2 gap-3 mt-4">
        <div className="col-span-2">
          <Label>Show title</Label>
          <input
            defaultValue={show.title}
            onBlur={(e) => onChange({ title: e.target.value })}
            className="input-sp"
          />
        </div>
        <div className="col-span-2">
          <Label>Show description</Label>
          <textarea
            defaultValue={show.description}
            onBlur={(e) => onChange({ description: e.target.value })}
            rows={3}
            className="input-sp"
          />
        </div>
        <div>
          <Label>Author</Label>
          <input
            defaultValue={show.author}
            onBlur={(e) => onChange({ author: e.target.value })}
            className="input-sp"
          />
        </div>
        <div>
          <Label>Author email</Label>
          <input
            defaultValue={show.authorEmail}
            onBlur={(e) => onChange({ authorEmail: e.target.value })}
            className="input-sp"
          />
        </div>
        <div>
          <Label>Language (ISO)</Label>
          <input
            defaultValue={show.language}
            onBlur={(e) => onChange({ language: e.target.value })}
            className="input-sp"
          />
        </div>
        <div>
          <Label>iTunes category</Label>
          <input
            defaultValue={show.categoryItunes}
            onBlur={(e) => onChange({ categoryItunes: e.target.value })}
            className="input-sp"
          />
        </div>
        <div className="col-span-2">
          <Label>Cover art URL (1400×1400 minimum, JPG/PNG)</Label>
          <input
            defaultValue={show.coverUrl}
            onBlur={(e) => onChange({ coverUrl: e.target.value })}
            className="input-sp"
          />
        </div>
      </div>
    </details>
  );
}
