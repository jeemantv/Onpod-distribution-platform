"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import type { FileItem, VidType } from "@/lib/types";
import { PublishingCalendar } from "./PublishingCalendar";
import {
  PINNED_LANGUAGES,
  ALL_LANGUAGES,
  pickYouTubeLanguage,
} from "@/lib/youtube-languages";

interface YouTubeChannel {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  subscriberCount: string | null;
}

interface YouTubePlaylist {
  id: string;
  title: string;
  itemCount: number;
}

interface ConnectionState {
  connected: boolean;
  channel: YouTubeChannel | null;
  channels: YouTubeChannel[];
  configured: boolean;
}

const SHORT_DURATION_THRESHOLD = 90;

export interface PublishedInfo {
  videoId: string;
  url: string;
  title: string;
  fileId: string;
  init: {
    sessionUri: string;
    videoUrl: string;
    sizeBytes: number;
    contentType: string;
    title: string;
    vidType: "long" | "short";
    publishAt: string | null;
    visibility: "public" | "unlisted" | "private";
    channelId: string;
  };
  playlistId: string | null;
  thumbnailUrl: string | null;
  thumbnailBase64: string | null;
}

export function YouTubeModal({
  fileId,
  file,
  aiReady,
  onClose,
  onPublished,
}: {
  fileId: string;
  file: FileItem;
  aiReady: boolean;
  onClose: () => void;
  onPublished?: (info: PublishedInfo) => void;
}) {
  const [connection, setConnection] = useState<ConnectionState | null>(null);
  const [playlists, setPlaylists] = useState<YouTubePlaylist[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [aiLoaded, setAiLoaded] = useState(false);

  const [publishMode, setPublishMode] = useState<"now" | "schedule">("now");
  const [vidType, setVidType] = useState<VidType>("long");
  const [vidTypeAuto, setVidTypeAuto] = useState(true);
  const [visibility, setVisibility] = useState<"public" | "unlisted" | "private">("public");
  const [scheduledDate, setScheduledDate] = useState<string | null>(null); // YYYY-MM-DD
  const [scheduledTime, setScheduledTime] = useState<string>("09:00"); // HH:MM
  const [durationSec, setDurationSec] = useState<number | null>(null);

  const [language, setLanguage] = useState<string>("en");
  const [languageAuto, setLanguageAuto] = useState(true);
  const [playlistId, setPlaylistId] = useState<string>("");

  const [availableThumbs, setAvailableThumbs] = useState<
    { label: string; name: string; url: string }[]
  >([]);
  const [selectedThumb, setSelectedThumb] = useState<{
    url: string | null;
    base64: string | null;
  }>({ url: null, base64: null });

  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [meRes, plRes, tbRes] = await Promise.all([
        fetch("/api/youtube/me"),
        fetch("/api/youtube/playlists"),
        // no-store so a just-saved cover art shows up immediately
        fetch(`/api/files/${fileId}/thumbnails`, { cache: "no-store" }),
      ]);
      const meBody = (await meRes.json()) as ConnectionState;
      if (!cancelled) setConnection(meBody);
      const plBody = (await plRes.json()) as { playlists?: YouTubePlaylist[] };
      if (!cancelled) setPlaylists(plBody.playlists ?? []);
      const tbBody = (await tbRes.json()) as {
        thumbnails?: { label: string; name: string; url: string }[];
      };
      if (!cancelled && tbBody.thumbnails) {
        // Sort so cover art shows first
        const sorted = [...tbBody.thumbnails].sort((a, b) =>
          a.label === "cover" ? -1 : b.label === "cover" ? 1 : 0,
        );
        // Append a fresh cache-buster so a just-saved cover doesn't pull a stale cached image
        const stamped = sorted.map((t) => ({
          ...t,
          url: t.url + (t.url.includes("?") ? "&" : "?") + "ts=" + Date.now(),
        }));
        setAvailableThumbs(stamped);
        const cover = stamped.find((t) => t.label === "cover");
        if (cover) setSelectedThumb({ url: cover.url, base64: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  const handleCustomThumb = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const data = reader.result as string;
      const b64 = data.split(",")[1] ?? "";
      setSelectedThumb({ url: data, base64: b64 });
    };
    reader.readAsDataURL(f);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/transcribe/${fileId}/status?include=data`);
        if (!res.ok) return;
        const body = (await res.json()) as {
          ai?: {
            title: string;
            description: string;
            chapters: string;
            tags: string[];
            language?: string;
          };
          transcript?: { durationSeconds: number; language?: string };
        };
        if (cancelled) return;
        if (body.ai) {
          setTitle(body.ai.title);
          const fullDescription =
            body.ai.description + (body.ai.chapters ? `\n\n${body.ai.chapters}` : "");
          setDescription(fullDescription);
          setTags(body.ai.tags ?? []);
          setAiLoaded(true);
        }
        const detected = body.ai?.language ?? body.transcript?.language;
        if (detected && languageAuto) {
          setLanguage(pickYouTubeLanguage(detected));
        }
        if (body.transcript?.durationSeconds) {
          applyDuration(body.transcript.durationSeconds);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileId]);

  useEffect(() => {
    if (durationSec !== null) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/files/${fileId}/download`, { method: "POST" });
      if (!res.ok) return;
      const { signedUrl } = (await res.json()) as { signedUrl: string };
      if (cancelled) return;
      const v = document.createElement("video");
      v.preload = "metadata";
      v.src = signedUrl;
      v.onloadedmetadata = () => {
        if (cancelled) return;
        applyDuration(v.duration);
        v.remove();
      };
      v.onerror = () => v.remove();
    })();
    return () => {
      cancelled = true;
    };
  }, [fileId, durationSec]);

  function applyDuration(seconds: number) {
    setDurationSec(seconds);
    if (vidTypeAuto) {
      setVidType(seconds < SHORT_DURATION_THRESHOLD ? "short" : "long");
    }
  }

  function setVidTypeManual(next: VidType) {
    setVidType(next);
    setVidTypeAuto(false);
  }

  const scheduledAt = useMemo(() => {
    if (publishMode !== "schedule" || !scheduledDate) return null;
    return `${scheduledDate}T${scheduledTime}`;
  }, [publishMode, scheduledDate, scheduledTime]);

  const startConnect = () => {
    window.location.href = `/api/youtube/connect?returnTo=${encodeURIComponent(window.location.pathname)}`;
  };

  const handlePublish = async () => {
    setPublishing(true);
    setError(null);
    try {
      // Server only starts the YouTube resumable session — bytes go from
      // the browser directly to YouTube to avoid Vercel's function timeout.
      const res = await fetch("/api/youtube/upload-init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId,
          title,
          description,
          tags,
          vidType,
          visibility,
          publishMode,
          scheduledAt: publishMode === "schedule" ? scheduledAt : null,
          language,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
      }
      const init = (await res.json()) as {
        sessionUri: string;
        videoUrl: string;
        sizeBytes: number;
        contentType: string;
        title: string;
        vidType: "long" | "short";
        publishAt: string | null;
        visibility: "public" | "unlisted" | "private";
        channelId: string;
      };

      // Hand off to the parent — it runs the upload as a background task
      // and shows progress in a toast. The modal closes right away.
      onPublished?.({
        videoId: "",
        url: "",
        title,
        init,
        fileId,
        playlistId: playlistId || null,
        thumbnailUrl: selectedThumb.base64 ? null : selectedThumb.url,
        thumbnailBase64: selectedThumb.base64,
      } as PublishedInfo);
      onClose();
      return;
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPublishing(false);
    }
  };

  if (connection && !connection.configured) {
    return (
      <Modal title="YouTube" subtitle="Setup required" onClose={onClose} size="md">
        <div className="text-center py-6">
          <p className="text-[14px] mb-2">YouTube isn&apos;t configured yet.</p>
          <p className="text-[12px] text-text-muted">
            Set <code className="text-accent-2">YOUTUBE_CLIENT_ID</code> and{" "}
            <code className="text-accent-2">YOUTUBE_CLIENT_SECRET</code> in env.
          </p>
        </div>
      </Modal>
    );
  }

  if (connection && !connection.connected) {
    return (
      <Modal title="YouTube" subtitle="Connect your channel" onClose={onClose} size="md">
        <div className="text-center py-8">
          <div className="inline-flex w-14 h-14 rounded-full bg-[rgba(239,68,68,0.15)] text-[#f87171] items-center justify-center mb-4">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58 2.78 2.78 0 0 0 1.94 2C5.12 20 12 20 12 20s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58zM9.75 15.5v-7L15.5 12z" />
            </svg>
          </div>
          <p className="text-[14px] mb-1">Connect YouTube to publish from OnPod</p>
          <p className="text-[12px] text-text-muted mb-6">
            You&apos;ll grant the YouTube upload scope on your account.
          </p>
          <button
            onClick={startConnect}
            className="px-5 py-2.5 rounded-[10px] bg-accent text-white font-medium text-[13px]"
          >
            Connect YouTube
          </button>
        </div>
      </Modal>
    );
  }

  const channel = connection?.channel;

  return (
    <Modal
      title="Publish to YouTube"
      subtitle={file.name}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-[8px] text-text-muted hover:text-text"
          >
            Cancel
          </button>
          <button
            disabled={
              publishing ||
              !title.trim() ||
              (publishMode === "schedule" && !scheduledDate)
            }
            onClick={handlePublish}
            className="px-5 py-2.5 rounded-[10px] bg-accent text-white text-[13px] font-medium disabled:opacity-60"
          >
            {publishing
              ? "Uploading…"
              : publishMode === "now"
                ? "Publish now"
                : "Schedule"}
          </button>
        </>
      }
    >
      {channel ? (
        <div className="flex items-center gap-3 mb-5 p-3 bg-bg-elev-2 border border-border rounded-[12px]">
          {channel.thumbnailUrl ? (
            <img
              src={channel.thumbnailUrl}
              alt={channel.title}
              className="w-10 h-10 rounded-full"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-[linear-gradient(135deg,#ff3b30,#ff8a00)] flex items-center justify-center font-semibold text-[13px]">
              {channel.title.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="flex-1">
            <div className="text-[13px] font-medium">{channel.title}</div>
            {channel.subscriberCount ? (
              <div className="text-[11px] text-text-muted">
                {channel.subscriberCount} subscribers
              </div>
            ) : null}
          </div>
          <button
            onClick={startConnect}
            className="text-[12px] text-text-muted hover:text-text"
          >
            Switch account
          </button>
        </div>
      ) : null}

      <div
        className={`mb-5 p-3 rounded-[10px] border text-[12px] flex items-center gap-2 ${
          aiLoaded || aiReady
            ? "bg-[rgba(16,185,129,0.08)] border-[rgba(16,185,129,0.25)] text-[#34d399]"
            : "bg-[rgba(245,158,11,0.08)] border-[rgba(245,158,11,0.25)] text-[#fbbf24]"
        }`}
      >
        {aiLoaded
          ? "AI-generated metadata loaded. Edit before publishing."
          : "No AI content yet — run the AI button first for auto-filled metadata."}
      </div>

      {durationSec !== null ? (
        <div className="mb-4 text-[11px] text-text-muted">
          Duration: {Math.floor(durationSec / 60)}m {Math.round(durationSec % 60)}s ·{" "}
          {vidTypeAuto ? (
            <span className="text-accent-2">
              auto-detected as {vidType === "short" ? "YouTube Short" : "regular video"}{" "}
              {vidType === "short"
                ? `(< ${SHORT_DURATION_THRESHOLD}s)`
                : `(≥ ${SHORT_DURATION_THRESHOLD}s)`}
            </span>
          ) : (
            <span>manual override</span>
          )}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <FieldLabel>Title</FieldLabel>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            className="input-yt"
          />
          <p className="text-[11px] text-text-dim mt-1">{title.length}/100</p>
        </div>

        <div className="col-span-2">
          <FieldLabel>Description</FieldLabel>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            maxLength={5000}
            className="input-yt"
          />
          <p className="text-[11px] text-text-dim mt-1">{description.length}/5000</p>
        </div>

        <div>
          <FieldLabel>Video type</FieldLabel>
          <div className="flex bg-bg-elev-2 border border-border rounded-[10px] p-1">
            <button
              onClick={() => setVidTypeManual("long")}
              className={`flex-1 py-1.5 text-[12px] rounded-[6px] ${
                vidType === "long" ? "bg-bg-elev-3 text-text" : "text-text-muted"
              }`}
            >
              Regular video
            </button>
            <button
              onClick={() => setVidTypeManual("short")}
              className={`flex-1 py-1.5 text-[12px] rounded-[6px] ${
                vidType === "short" ? "bg-bg-elev-3 text-text" : "text-text-muted"
              }`}
            >
              YouTube Short
            </button>
          </div>
        </div>

        <div>
          <FieldLabel>Visibility</FieldLabel>
          <div className="flex bg-bg-elev-2 border border-border rounded-[10px] p-1">
            {(["public", "unlisted", "private"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setVisibility(v)}
                className={`flex-1 py-1.5 text-[12px] rounded-[6px] capitalize ${
                  visibility === v ? "bg-bg-elev-3 text-text" : "text-text-muted"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <div>
          <FieldLabel>Publish mode</FieldLabel>
          <div className="flex bg-bg-elev-2 border border-border rounded-[10px] p-1">
            <button
              onClick={() => setPublishMode("now")}
              className={`flex-1 py-1.5 text-[12px] rounded-[6px] ${
                publishMode === "now" ? "bg-bg-elev-3 text-text" : "text-text-muted"
              }`}
            >
              Publish immediately
            </button>
            <button
              onClick={() => setPublishMode("schedule")}
              className={`flex-1 py-1.5 text-[12px] rounded-[6px] ${
                publishMode === "schedule" ? "bg-bg-elev-3 text-text" : "text-text-muted"
              }`}
            >
              Schedule later
            </button>
          </div>
        </div>

        <div>
          <FieldLabel>
            Language{" "}
            {languageAuto ? (
              <span className="text-accent-2 normal-case text-[10px] ml-1">
                auto-detected
              </span>
            ) : null}
          </FieldLabel>
          <select
            value={language}
            onChange={(e) => {
              setLanguage(e.target.value);
              setLanguageAuto(false);
            }}
            className="input-yt"
          >
            <optgroup label="Common">
              {PINNED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="All languages">
              {ALL_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        <div className="col-span-2">
          <FieldLabel>
            Playlist{" "}
            {playlists.length === 0 ? (
              <span className="text-text-dim normal-case text-[10px] ml-1">
                (no playlists on your channel yet)
              </span>
            ) : null}
          </FieldLabel>
          <select
            value={playlistId}
            onChange={(e) => setPlaylistId(e.target.value)}
            className="input-yt"
            disabled={playlists.length === 0}
          >
            <option value="">(none)</option>
            {playlists.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} ({p.itemCount})
              </option>
            ))}
          </select>
        </div>

        {publishMode === "schedule" ? (
          <div className="col-span-2">
            <FieldLabel>Pick a date and time</FieldLabel>
            <SchedulePicker
              vidType={vidType}
              valueDate={scheduledDate}
              valueTime={scheduledTime}
              onChangeDate={setScheduledDate}
              onChangeTime={setScheduledTime}
            />
          </div>
        ) : null}

        <div className="col-span-2">
          <FieldLabel>Thumbnail</FieldLabel>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {availableThumbs.map((t) => (
              <button
                key={t.label}
                onClick={() => setSelectedThumb({ url: t.url, base64: null })}
                className={`aspect-video rounded-[8px] overflow-hidden border-2 ${
                  selectedThumb.url === t.url && !selectedThumb.base64
                    ? "border-accent"
                    : "border-border"
                }`}
                title={t.name}
              >
                <img src={t.url} alt={t.name} className="w-full h-full object-cover" />
              </button>
            ))}
            <label
              className={`aspect-video rounded-[8px] border-2 flex flex-col items-center justify-center gap-1 cursor-pointer text-[11px] text-text-muted hover:text-text ${
                selectedThumb.base64 ? "border-accent" : "border-dashed border-border"
              }`}
            >
              {selectedThumb.base64 && selectedThumb.url ? (
                <img src={selectedThumb.url} alt="custom" className="w-full h-full object-cover rounded-[6px]" />
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  Upload custom
                </>
              )}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleCustomThumb}
              />
            </label>
          </div>
          {availableThumbs.length === 0 ? (
            <p className="text-[11px] text-text-dim mt-2">
              No thumbnails generated yet. Open AI Studio → Thumbnails to create some, or upload a custom image.
            </p>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="mt-4 p-3 rounded-[10px] bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-[12px] text-[#f87171]">
          {error}
        </div>
      ) : null}

      <div className="mt-6">
        <div className="text-[12px] text-text-muted mb-2">
          Publishing calendar — showing {vidType === "short" ? "Shorts" : "long-form"} only
        </div>
        <PublishingCalendar platform="youtube" vidType={vidType} />
      </div>

      <style jsx>{`
        :global(.input-yt) {
          width: 100%;
          padding: 10px 14px;
          background: #1c1c20;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          color: #fafafa;
          font-family: inherit;
          font-size: 13px;
        }
        :global(.input-yt:focus) {
          outline: none;
          border-color: rgba(255, 255, 255, 0.16);
        }
        :global(.input-yt:disabled) {
          opacity: 0.5;
        }
      `}</style>
    </Modal>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[12px] text-text-muted mb-2">{children}</label>
  );
}

interface HistoryEvent {
  date: string; // YYYY-MM-DD
  vidType: "long" | "short" | null;
  fileName: string;
  action: "draft" | "scheduled" | "published";
}

function SchedulePicker({
  vidType,
  valueDate,
  valueTime,
  onChangeDate,
  onChangeTime,
}: {
  vidType: VidType;
  valueDate: string | null;
  valueTime: string;
  onChangeDate: (v: string) => void;
  onChangeTime: (v: string) => void;
}) {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [events, setEvents] = useState<HistoryEvent[]>([]);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/publish/history");
      if (!res.ok) return;
      const body = (await res.json()) as {
        history: Array<{
          fileName: string;
          platform: string;
          action: "draft" | "scheduled" | "published";
          vidType: "long" | "short" | null;
          scheduledFor: string | null;
          createdAt: string;
        }>;
      };
      const evs: HistoryEvent[] = body.history
        .filter((r) => r.platform === "youtube")
        .map((r) => ({
          date: (r.scheduledFor ?? r.createdAt).slice(0, 10),
          vidType: r.vidType,
          fileName: r.fileName,
          action: r.action,
        }));
      setEvents(evs);
    })();
  }, []);

  const matchingEvents = useMemo(() => {
    const filtered = events.filter(
      (e) => !e.vidType || e.vidType === vidType,
    );
    const map: Record<string, HistoryEvent[]> = {};
    for (const e of filtered) (map[e.date] ??= []).push(e);
    return map;
  }, [events, vidType]);

  const year = month.getFullYear();
  const m = month.getMonth();
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const firstDow = new Date(year, m, 1).getDay();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="bg-bg-elev-2 border border-border rounded-[12px] p-4">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setMonth(new Date(year, m - 1, 1))}
          className="text-text-muted hover:text-text px-2"
        >
          ‹
        </button>
        <div className="display text-[16px]">
          {month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </div>
        <button
          onClick={() => setMonth(new Date(year, m + 1, 1))}
          className="text-text-muted hover:text-text px-2"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-text-dim mb-1">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDow }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const date = new Date(year, m, day);
          const iso = `${year}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const past = date < today;
          const dayEvents = matchingEvents[iso] ?? [];
          const selected = valueDate === iso;
          return (
            <button
              key={day}
              disabled={past}
              onClick={() => onChangeDate(iso)}
              title={dayEvents
                .map((e) => `${e.action}: ${e.fileName}`)
                .join("\n")}
              className={`relative h-12 rounded-[6px] text-[12px] flex flex-col items-center justify-center gap-1 ${
                past
                  ? "text-text-dim/40 cursor-not-allowed"
                  : selected
                    ? "bg-accent text-white"
                    : "hover:bg-bg-elev-3"
              }`}
            >
              <span>{day}</span>
              {dayEvents.length > 0 ? (
                <div className="flex gap-0.5">
                  {dayEvents.slice(0, 3).map((e, i) => (
                    <span
                      key={i}
                      className={`w-1 h-1 rounded-full ${
                        e.action === "published"
                          ? "bg-success"
                          : e.action === "scheduled"
                            ? "bg-warning"
                            : "bg-text-muted"
                      }`}
                    />
                  ))}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] text-text-muted mb-1">Date</label>
          <div className="px-3 py-2 bg-bg-elev-3 border border-border rounded-[8px] text-[12px]">
            {valueDate ?? "(pick a date above)"}
          </div>
        </div>
        <div>
          <label className="block text-[11px] text-text-muted mb-1">Time (local)</label>
          <input
            type="time"
            value={valueTime}
            onChange={(e) => onChangeTime(e.target.value)}
            className="input-yt"
          />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-4 text-[11px] text-text-muted flex-wrap">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-success" /> Published
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-warning" /> Scheduled
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-text-muted" /> Draft
        </span>
      </div>
    </div>
  );
}
