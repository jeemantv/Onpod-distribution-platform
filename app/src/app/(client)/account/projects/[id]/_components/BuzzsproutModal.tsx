"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import type { FileItem } from "@/lib/types";
import { SpotifyRssPanel } from "./SpotifyRssPanel";

interface ConnectionStatus {
  connected: boolean;
  podcastId?: string;
  episodeCount?: number;
  recent?: { id: number; title: string; publishedAt: string | null; private: boolean }[];
  stale?: boolean;
  error?: string;
}

type Tab = "buzzsprout" | "rss";
type Mode = "now" | "schedule" | "draft";

interface DraftForm {
  title: string;
  description: string;
  summary: string;
  tags: string;
  seasonNumber: string;
  episodeNumber: string;
  mode: Mode;
  scheduledAt: string; // datetime-local string
  artworkUrl: string;
}

const EMPTY_FORM: DraftForm = {
  title: "",
  description: "",
  summary: "",
  tags: "",
  seasonNumber: "",
  episodeNumber: "",
  mode: "now",
  scheduledAt: "",
  artworkUrl: "",
};

function storageKey(fileId: string) {
  return `onpod:buzzsprout-draft:${fileId}`;
}

function readDraft(fileId: string): DraftForm | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(fileId));
    if (!raw) return null;
    return { ...EMPTY_FORM, ...(JSON.parse(raw) as Partial<DraftForm>) };
  } catch {
    return null;
  }
}

function writeDraft(fileId: string, draft: DraftForm) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(fileId), JSON.stringify(draft));
  } catch {
    /* quota / private mode */
  }
}

function clearDraft(fileId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(fileId));
  } catch {
    /* ignore */
  }
}

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
  const [form, setForm] = useState<DraftForm>(EMPTY_FORM);
  const [hasAI, setHasAI] = useState<boolean | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [uploadingArt, setUploadingArt] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    id: number;
    title: string;
    private: boolean;
  } | null>(null);
  const hydrated = useRef(false);

  const update = useCallback(
    <K extends keyof DraftForm>(key: K, value: DraftForm[K]) => {
      setForm((prev) => {
        const next = { ...prev, [key]: value };
        writeDraft(fileId, next);
        return next;
      });
    },
    [fileId],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [statusRes, aiRes] = await Promise.all([
        fetch("/api/buzzsprout/status"),
        fetch(`/api/transcribe/${fileId}/status?include=data`),
      ]);
      const s = (await statusRes.json().catch(() => ({}))) as ConnectionStatus;
      const a = (await aiRes.json().catch(() => ({}))) as {
        hasAI?: boolean;
        ai?: {
          title?: string;
          description?: string;
          summary?: string;
          tags?: string[];
        };
      };
      if (cancelled) return;
      setStatus(s);
      setHasAI(!!a.hasAI);

      // Hydrate priority: saved draft > AI metadata > file name. We only
      // run this once on first mount so user edits aren't clobbered.
      if (!hydrated.current) {
        hydrated.current = true;
        const saved = readDraft(fileId);
        if (saved && (saved.title || saved.description)) {
          setForm(saved);
        } else {
          const base: DraftForm = {
            ...EMPTY_FORM,
            title: a.ai?.title ?? file.name.replace(/\.\w+$/, ""),
            description: a.ai?.description ?? "",
            summary:
              a.ai?.summary ??
              (a.ai?.description ? a.ai.description.slice(0, 280) : ""),
            tags: a.ai?.tags?.join(", ") ?? "",
          };
          setForm(base);
          writeDraft(fileId, base);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileId, file.name]);

  const handleArtworkUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Artwork must be an image file (JPG or PNG).");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setError("Artwork must be under 4 MB.");
      return;
    }
    setError(null);
    setUploadingArt(true);
    try {
      const buf = await file.arrayBuffer();
      const base64 = bufferToBase64(buf);
      const res = await fetch("/api/buzzsprout/artwork", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId, imageBase64: base64 }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        url?: string;
        message?: string;
        error?: string;
      };
      if (!res.ok || !body.url) {
        throw new Error(body.message ?? body.error ?? `Upload failed (${res.status})`);
      }
      update("artworkUrl", body.url);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploadingArt(false);
    }
  };

  const publish = async () => {
    setPublishing(true);
    setError(null);
    try {
      const publishedAt =
        form.mode === "schedule" && form.scheduledAt
          ? new Date(form.scheduledAt).toISOString()
          : undefined;
      const res = await fetch("/api/buzzsprout/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId,
          title: form.title,
          description: form.description,
          summary: form.summary,
          tags: form.tags,
          artworkUrl: form.artworkUrl || undefined,
          publishedAt,
          privateEpisode: form.mode === "draft",
          seasonNumber: form.seasonNumber ? Number(form.seasonNumber) : undefined,
          episodeNumber: form.episodeNumber ? Number(form.episodeNumber) : undefined,
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
      clearDraft(fileId);
      setSuccess(body.episode);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPublishing(false);
    }
  };

  const ctaLabel = useMemo(() => {
    if (publishing) {
      if (form.mode === "draft") return "Saving draft…";
      if (form.mode === "schedule") return "Scheduling…";
      return "Publishing…";
    }
    if (form.mode === "draft") return "Save draft";
    if (form.mode === "schedule") return "Schedule";
    return "Publish now";
  }, [publishing, form.mode]);

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
              : form.mode === "schedule"
                ? `Scheduled for ${new Date(form.scheduledAt).toLocaleString()}. Buzzsprout will distribute it then.`
                : "Published — Buzzsprout is distributing to Spotify, Apple, Amazon Music, and the rest of your linked directories now."}
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

  const scheduleInvalid =
    form.mode === "schedule" &&
    (!form.scheduledAt || new Date(form.scheduledAt).getTime() < Date.now());

  // The footer only carries the Buzzsprout publish CTA. When the user
  // switches to the RSS tab, the panel renders its own action button
  // inline (so the modal footer would be misleading) — hide it.
  const showBuzzsproutFooter = tab === "buzzsprout" && status?.connected;
  const showGenericFooter = tab === "buzzsprout" && !status?.connected;

  return (
    <Modal
      title="Publish to Buzzsprout"
      subtitle={file.name}
      onClose={onClose}
      size="lg"
      footer={
        showBuzzsproutFooter ? (
          <>
            <button onClick={onClose} className="px-4 py-2 text-text-muted hover:text-text">
              Close (keeps draft)
            </button>
            <button
              disabled={publishing || !form.title.trim() || scheduleInvalid}
              onClick={publish}
              className="px-5 py-2.5 rounded-[10px] bg-accent text-white text-[13px] font-medium disabled:opacity-60"
            >
              {ctaLabel}
            </button>
          </>
        ) : showGenericFooter ? (
          <button onClick={onClose} className="px-4 py-2 text-text-muted hover:text-text">
            Close
          </button>
        ) : undefined
      }
    >
      <div className="flex items-start justify-between gap-3 mb-5">
        <Tabs current={tab} onChange={setTab} />
        <GuideButton />
      </div>

      {tab === "rss" ? (
        <SpotifyRssPanel fileId={fileId} file={file} onClose={onClose} />
      ) : !status ? (
        <div className="text-[13px] text-text-muted py-10 text-center">Loading…</div>
      ) : !status.connected ? (
        <InlineConnect
          onConnected={async () => {
            const r = await fetch("/api/buzzsprout/status");
            setStatus((await r.json().catch(() => ({ connected: false }))) as ConnectionStatus);
          }}
        />
      ) : (
        <div className="space-y-5">
          <div className="p-3 bg-bg-elev-2 border border-border rounded-[10px] flex items-center gap-3 text-[12px]">
            <span className="inline-flex w-2 h-2 rounded-full bg-[#34d399]" />
            <span className="flex-1">
              Connected to podcast{" "}
              <code className="text-accent-2">#{status.podcastId}</code>
              {status.episodeCount != null
                ? ` — ${status.episodeCount} episode${status.episodeCount === 1 ? "" : "s"} live`
                : null}
              {status.stale ? " (token may be stale)" : null}
            </span>
            <a href="/settings/podcast" className="text-text-muted underline text-[11px]">
              Manage
            </a>
          </div>

          {hasAI === false ? (
            <div className="p-3 rounded-[10px] bg-[rgba(245,158,11,0.08)] border border-[rgba(245,158,11,0.25)] text-[12px] text-[#fbbf24]">
              Heads up — AI metadata isn&apos;t generated for this file yet, so
              title, description, summary, and tags are blank. You can fill
              them in manually below, or close this and click the AI button
              first to auto-fill everything.
            </div>
          ) : null}

          <div>
            <Label>Episode title</Label>
            <input
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              className="input-bz"
            />
          </div>
          <div>
            <Label>Show notes / description</Label>
            <textarea
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              rows={5}
              className="input-bz"
            />
          </div>
          <div>
            <Label>Short summary (≤280 chars, used in some directories)</Label>
            <textarea
              value={form.summary}
              onChange={(e) => update("summary", e.target.value)}
              rows={2}
              maxLength={280}
              className="input-bz"
            />
          </div>
          <div>
            <Label>Tags (comma-separated)</Label>
            <input
              value={form.tags}
              onChange={(e) => update("tags", e.target.value)}
              className="input-bz"
            />
          </div>

          <ArtworkUploader
            currentUrl={form.artworkUrl}
            uploading={uploadingArt}
            onUpload={handleArtworkUpload}
            onClear={() => update("artworkUrl", "")}
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Season</Label>
              <input
                value={form.seasonNumber}
                onChange={(e) => update("seasonNumber", e.target.value)}
                className="input-bz"
              />
            </div>
            <div>
              <Label>Episode</Label>
              <input
                value={form.episodeNumber}
                onChange={(e) => update("episodeNumber", e.target.value)}
                className="input-bz"
              />
            </div>
          </div>

          <ModeSelector
            mode={form.mode}
            onChange={(m) => update("mode", m)}
            scheduledAt={form.scheduledAt}
            onScheduleChange={(v) => update("scheduledAt", v)}
            scheduleInvalid={scheduleInvalid}
          />

          {error ? (
            <div className="mt-1 p-3 rounded-[10px] bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-[12px] text-[#f87171]">
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

function InlineConnect({ onConnected }: { onConnected: () => void | Promise<void> }) {
  const [podcastId, setPodcastId] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
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
      await onConnected();
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 py-2">
      <div className="p-5 rounded-[12px] bg-bg-elev-2 border border-border">
        <h3 className="text-[14px] font-medium mb-1">Connect Buzzsprout to publish</h3>
        <p className="text-[12px] text-text-muted leading-relaxed mb-4">
          One-time setup. After this, every episode auto-distributes to
          Spotify, Apple Podcasts, Amazon Music, and your other directories.{" "}
          <a className="underline text-accent-2" href="/docs/podcast-setup" target="_blank" rel="noreferrer">
            Setup guide + pricing →
          </a>
        </p>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label>Podcast ID (numeric — from your buzzsprout.com/&lt;id&gt; URL)</Label>
            <input
              required
              value={podcastId}
              onChange={(e) => setPodcastId(e.target.value)}
              placeholder="e.g. 2364712"
              className="input-bz"
            />
          </div>
          <div>
            <Label>API token (Buzzsprout dashboard → Settings → Buzzsprout API)</Label>
            <input
              required
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="paste token"
              autoComplete="off"
              className="input-bz"
            />
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={busy || !podcastId.trim() || !token.trim()}
              className="px-4 py-2 rounded-[10px] bg-accent text-white text-[13px] disabled:opacity-50"
            >
              {busy ? "Verifying…" : "Connect"}
            </button>
            {err ? <span className="text-[12px] text-danger">{err}</span> : null}
          </div>
        </form>
      </div>
      <div className="p-4 rounded-[12px] bg-bg border border-border text-[12px] text-text-muted leading-relaxed">
        <strong className="text-text">Free path</strong> — switch to the{" "}
        <em>Spotify · manual (free)</em> tab above to use OnPod&apos;s RSS feed
        directly. No Buzzsprout subscription needed; you paste the feed URL
        once into each directory yourself.
      </div>
    </div>
  );
}

function ArtworkUploader({
  currentUrl,
  uploading,
  onUpload,
  onClear,
}: {
  currentUrl: string;
  uploading: boolean;
  onUpload: (file: File) => void | Promise<void>;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div>
      <Label>Episode artwork (optional — Buzzsprout falls back to your show cover if blank)</Label>
      <div className="flex items-center gap-3">
        {currentUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentUrl}
            alt="Artwork"
            className="w-16 h-16 rounded-[10px] object-cover border border-border"
          />
        ) : (
          <div className="w-16 h-16 rounded-[10px] border border-dashed border-border flex items-center justify-center text-[10px] text-text-muted">
            no art
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onUpload(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="px-3 py-1.5 rounded-[8px] bg-bg-elev-3 border border-border-strong text-[12px] disabled:opacity-50"
        >
          {uploading ? "Uploading…" : currentUrl ? "Replace artwork" : "Upload artwork"}
        </button>
        {currentUrl ? (
          <button
            type="button"
            onClick={onClear}
            className="px-3 py-1.5 text-[12px] text-text-muted hover:text-danger"
          >
            Remove
          </button>
        ) : null}
      </div>
      <p className="mt-2 text-[11px] text-text-muted">
        JPG or PNG, ≤4 MB. Square works best (Buzzsprout recommends 3000×3000).
      </p>
    </div>
  );
}

function ModeSelector({
  mode,
  onChange,
  scheduledAt,
  onScheduleChange,
  scheduleInvalid,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
  scheduledAt: string;
  onScheduleChange: (v: string) => void;
  scheduleInvalid: boolean;
}) {
  return (
    <div className="p-3 bg-bg-elev-2 border border-border rounded-[10px]">
      <div className="flex items-center gap-1 mb-3">
        <ModeBtn active={mode === "now"} onClick={() => onChange("now")}>
          Publish now
        </ModeBtn>
        <ModeBtn active={mode === "schedule"} onClick={() => onChange("schedule")}>
          Schedule
        </ModeBtn>
        <ModeBtn active={mode === "draft"} onClick={() => onChange("draft")}>
          Save as draft
        </ModeBtn>
      </div>
      {mode === "now" ? (
        <p className="text-[11px] text-text-muted">
          Episode goes live on Buzzsprout immediately. Spotify pulls within
          minutes; Apple within an hour or two.
        </p>
      ) : mode === "schedule" ? (
        <div>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => onScheduleChange(e.target.value)}
            className="input-bz"
          />
          <p className="mt-2 text-[11px] text-text-muted">
            Buzzsprout holds the episode until this time, then publishes and
            distributes automatically.
          </p>
          {scheduleInvalid ? (
            <p className="mt-1 text-[11px] text-danger">
              Pick a future date/time.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-[11px] text-text-muted">
          Episode is uploaded as a private draft. Nothing distributes — you
          publish manually from the Buzzsprout dashboard later.
        </p>
      )}
    </div>
  );
}

function ModeBtn({
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
      type="button"
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

function GuideButton() {
  return (
    <a
      href="/docs/podcast-setup"
      target="_blank"
      rel="noreferrer"
      title="Open setup + distribution guide (downloadable as MD or PDF)"
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[8px] bg-bg-elev-2 border border-border hover:border-border-strong text-[11px] text-text-muted hover:text-text shrink-0"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      <span className="hidden sm:inline">Guide</span>
    </a>
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

function bufferToBase64(buf: ArrayBuffer): string {
  // Browser-safe base64 of a binary buffer. Chunked to avoid blowing the
  // String.fromCharCode stack on large files.
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
