"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import type { FileItem, VidType } from "@/lib/types";
import { PublishingCalendar } from "./PublishingCalendar";

interface YouTubeChannel {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  subscriberCount: string | null;
}

interface ConnectionState {
  connected: boolean;
  channel: YouTubeChannel | null;
  channels: YouTubeChannel[];
  configured: boolean;
}

const SHORT_DURATION_THRESHOLD = 90;

export function YouTubeModal({
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
  const [connection, setConnection] = useState<ConnectionState | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [aiLoaded, setAiLoaded] = useState(false);

  const [publishMode, setPublishMode] = useState<"now" | "schedule" | "private">("now");
  const [vidType, setVidType] = useState<VidType>("long");
  const [vidTypeAuto, setVidTypeAuto] = useState(true);
  const [visibility, setVisibility] = useState<"public" | "unlisted" | "private">("public");
  const [scheduledAt, setScheduledAt] = useState("");
  const [durationSec, setDurationSec] = useState<number | null>(null);

  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ videoId: string; url: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/youtube/me");
      const body = (await res.json()) as ConnectionState;
      if (!cancelled) setConnection(body);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
          };
          transcript?: { durationSeconds: number };
        };
        if (cancelled) return;
        if (body.ai) {
          setTitle(body.ai.title);
          const fullDescription =
            body.ai.description +
            (body.ai.chapters ? `\n\n${body.ai.chapters}` : "");
          setDescription(fullDescription);
          setTags(body.ai.tags ?? []);
          setAiLoaded(true);
        }
        if (body.transcript?.durationSeconds) {
          applyDuration(body.transcript.durationSeconds);
        }
      } catch {
        // ignore — modal still works without AI
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  useEffect(() => {
    // Fallback: probe video duration client-side if we don't have it from the transcript.
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

  const startConnect = () => {
    window.location.href = `/api/youtube/connect?returnTo=${encodeURIComponent(window.location.pathname)}`;
  };

  const handlePublish = async () => {
    setPublishing(true);
    setError(null);
    try {
      const res = await fetch("/api/youtube/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId,
          channelId: connection?.channel?.id,
          title,
          description,
          tags,
          vidType,
          visibility,
          publishMode,
          scheduledAt: publishMode === "schedule" ? scheduledAt : null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
      }
      const body = (await res.json()) as { videoId: string };
      setSuccess({
        videoId: body.videoId,
        url: `https://www.youtube.com/watch?v=${body.videoId}`,
      });
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
            <code className="text-accent-2">YOUTUBE_CLIENT_SECRET</code> in{" "}
            <code className="text-accent-2">app/.env.local</code> and restart{" "}
            <code className="text-accent-2">next dev</code>.
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
            You&apos;ll grant the YouTube upload scope on your account. OnPod uploads only when you click Publish.
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

  if (success) {
    return (
      <Modal title="Published" subtitle={file.name} onClose={onClose} size="md">
        <div className="text-center py-6">
          <div className="inline-flex w-14 h-14 rounded-full bg-[rgba(16,185,129,0.15)] text-[#34d399] items-center justify-center mb-4">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <p className="text-[14px] mb-1">Uploaded to YouTube</p>
          <a
            href={success.url}
            target="_blank"
            rel="noreferrer"
            className="text-[13px] text-accent underline"
          >
            {success.url}
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

  const channel = connection?.channel;

  return (
    <Modal
      title="Publish to YouTube"
      subtitle={file.name}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 rounded-[8px] text-text-muted hover:text-text">
            Cancel
          </button>
          <button
            disabled={publishing || !title.trim()}
            onClick={handlePublish}
            className="px-5 py-2.5 rounded-[10px] bg-accent text-white text-[13px] font-medium disabled:opacity-60"
          >
            {publishing
              ? "Uploading…"
              : publishMode === "now"
                ? "Publish now"
                : publishMode === "schedule"
                  ? "Schedule"
                  : "Save private"}
          </button>
        </>
      }
    >
      {channel ? (
        <div className="flex items-center gap-3 mb-5 p-3 bg-bg-elev-2 border border-border rounded-[12px]">
          {channel.thumbnailUrl ? (
            <img src={channel.thumbnailUrl} alt={channel.title} className="w-10 h-10 rounded-full" />
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
          <button onClick={startConnect} className="text-[12px] text-text-muted hover:text-text">
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
          : "No AI content yet — run the AI button on this file first for auto-filled metadata."}
      </div>

      {durationSec !== null ? (
        <div className="mb-4 text-[11px] text-text-muted">
          Duration: {Math.floor(durationSec / 60)}m {Math.round(durationSec % 60)}s ·{" "}
          {vidTypeAuto ? (
            <span className="text-accent-2">
              auto-detected as {vidType === "short" ? "YouTube Short" : "regular video"}{" "}
              {vidType === "short" ? `(< ${SHORT_DURATION_THRESHOLD}s)` : `(≥ ${SHORT_DURATION_THRESHOLD}s)`}
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
          <select
            value={publishMode}
            onChange={(e) => setPublishMode(e.target.value as typeof publishMode)}
            className="input-yt"
          >
            <option value="now">Publish immediately</option>
            <option value="schedule">Schedule for later</option>
            <option value="private">Save as private</option>
          </select>
        </div>

        <div>
          <FieldLabel>Tags ({tags.length})</FieldLabel>
          <div className="px-3 py-2 bg-bg-elev-2 border border-border rounded-[10px] text-[12px] text-text-muted">
            {tags.length === 0 ? "(none — pulled from AI metadata)" : tags.slice(0, 6).join(", ") + (tags.length > 6 ? ` +${tags.length - 6}` : "")}
          </div>
        </div>

        {publishMode === "schedule" ? (
          <div className="col-span-2">
            <FieldLabel>Schedule date and time (your local time)</FieldLabel>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="input-yt"
            />
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="mt-4 p-3 rounded-[10px] bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-[12px] text-[#f87171]">
          {error}
        </div>
      ) : null}

      <div className="mt-6">
        <div className="text-[12px] text-text-muted mb-2">Publishing calendar</div>
        <PublishingCalendar platform="youtube" />
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
      `}</style>
    </Modal>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[12px] text-text-muted mb-2">{children}</label>
  );
}
