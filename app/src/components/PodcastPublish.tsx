"use client";

import { useEffect, useMemo, useState } from "react";

interface FileRow {
  key: string;
  filename: string;
  fileId: string;
}

interface Show {
  slug: string;
  title: string;
  author: string;
  coverUrl: string;
}

interface PublishResult {
  show: Show;
  feedUrl: string;
  episodeCount: number;
  addedEpisode: { title: string; audioUrl: string };
}

function isAudioOrVideo(name: string): boolean {
  return /\.(mp3|wav|m4a|aac|flac|ogg|mp4|mov|webm)$/i.test(name);
}

export function PodcastPublish({
  files,
  ownerEmail,
  showSettingsHref = "/settings/podcast",
}: {
  files: FileRow[];
  ownerEmail?: string | null;
  showSettingsHref?: string;
}) {
  const episodes = useMemo(
    () => files.filter((f) => isAudioOrVideo(f.filename)),
    [files],
  );
  const [activeFileId, setActiveFileId] = useState<string>("");
  const [show, setShow] = useState<Show | null>(null);
  const [feedUrl, setFeedUrl] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PublishResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (episodes.length > 0 && !activeFileId) {
      setActiveFileId(episodes[0].fileId);
    }
  }, [episodes, activeFileId]);

  useEffect(() => {
    void (async () => {
      try {
        const qs = ownerEmail ? `?email=${encodeURIComponent(ownerEmail)}` : "";
        const res = await fetch(`/api/rss/show${qs}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.show) {
          setShow(data.show);
          setFeedUrl(`/feeds/${data.show.slug}.xml`);
        }
      } catch {
        /* ignore */
      }
    })();
  }, [ownerEmail]);

  if (episodes.length === 0) return null;

  async function publish() {
    if (!activeFileId) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/rss/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: activeFileId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || `Publish failed (${res.status})`);
        return;
      }
      setResult(data);
      setShow(data.show);
      setFeedUrl(data.feedUrl);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-bg-elev border border-border rounded-[16px] p-4 mb-4">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h2 className="text-[14px] font-semibold">Podcast feed</h2>
        <a
          href={showSettingsHref}
          className="text-[12px] text-text-muted hover:text-text underline"
        >
          Show settings
        </a>
      </div>

      <p className="text-[12px] text-text-muted mb-3">
        Publishes this file to the podcast RSS feed. Spotify, Apple, and Amazon
        poll the feed automatically — submit the URL below to each directory
        once and new episodes appear on their own.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <label className="text-[11px] text-text-muted">
          File to publish
          <select
            value={activeFileId}
            onChange={(e) => setActiveFileId(e.target.value)}
            className="mt-1 w-full px-3 py-2 bg-bg-elev-2 border border-border rounded-[8px] text-[13px]"
          >
            {episodes.map((f) => (
              <option key={f.fileId} value={f.fileId}>
                {f.filename}
              </option>
            ))}
          </select>
        </label>
        <div className="text-[11px] text-text-muted">
          Show
          <div className="mt-1 px-3 py-2 bg-bg-elev-2 border border-border rounded-[8px] text-[13px]">
            {show ? show.title : "Will be created on first publish"}
          </div>
        </div>
      </div>

      <button
        onClick={publish}
        disabled={busy || !activeFileId}
        className="px-4 py-2 rounded-[10px] bg-accent text-white text-[13px] disabled:opacity-50"
      >
        {busy ? "Publishing…" : "Publish to podcast feed"}
      </button>

      {error ? <p className="mt-3 text-[12px] text-danger">{error}</p> : null}

      {result ? (
        <p className="mt-3 text-[12px] text-success">
          ✓ Published &quot;{result.addedEpisode.title}&quot; · episode #
          {result.episodeCount}
        </p>
      ) : null}

      {feedUrl ? (
        <div className="mt-4 p-3 bg-bg-elev-2 border border-border rounded-[10px]">
          <div className="text-[11px] text-text-muted mb-1">
            Your podcast RSS feed (submit this once to each directory):
          </div>
          <FeedUrlBox path={feedUrl} />
          <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2 text-[11px]">
            <a
              target="_blank"
              rel="noreferrer"
              href="https://podcasters.spotify.com/"
              className="px-3 py-2 bg-bg-elev-3 border border-border rounded-[8px] hover:border-border-strong text-center"
            >
              Spotify for Podcasters →
            </a>
            <a
              target="_blank"
              rel="noreferrer"
              href="https://podcastsconnect.apple.com/"
              className="px-3 py-2 bg-bg-elev-3 border border-border rounded-[8px] hover:border-border-strong text-center"
            >
              Apple Podcasts Connect →
            </a>
            <a
              target="_blank"
              rel="noreferrer"
              href="https://podcasters.amazon.com/"
              className="px-3 py-2 bg-bg-elev-3 border border-border rounded-[8px] hover:border-border-strong text-center"
            >
              Amazon Music →
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FeedUrlBox({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  const [fullUrl, setFullUrl] = useState(path);
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        setFullUrl(new URL(path, window.location.origin).toString());
      } catch {
        setFullUrl(path);
      }
    }
  }, [path]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 text-[12px] break-all bg-bg border border-border rounded-[8px] px-2 py-1.5 font-mono">
        {fullUrl}
      </code>
      <button
        onClick={copy}
        className="px-3 py-1.5 rounded-[8px] bg-accent text-white text-[12px]"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
