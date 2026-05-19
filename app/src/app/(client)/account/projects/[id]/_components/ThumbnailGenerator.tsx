"use client";

import { useEffect, useState } from "react";
import type { FileItem } from "@/lib/types";
import { CoverArtComposer } from "./CoverArtComposer";

const FRAME_COUNT = 8;
const FRAME_WIDTH = 640;
const JPEG_QUALITY = 0.8;

interface Thumbnail {
  label: string;
  url: string;
  reason: string;
}

const LABEL_TEXT: Record<string, string> = {
  group: "All speakers",
  primary: "Speaker A",
  secondary: "Speaker B",
};

export function ThumbnailGenerator({
  fileId,
  file,
  aiTitle,
}: {
  fileId: string;
  file: FileItem;
  aiTitle?: string;
}) {
  const [thumbnails, setThumbnails] = useState<Thumbnail[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<string>("");
  const [existingCoverUrl, setExistingCoverUrl] = useState<string | null>(null);

  void file;

  // Restore on mount: check B2 for existing sidecar thumbnails and cover.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/files/${fileId}/thumbnails`);
        if (!res.ok) return;
        const body = (await res.json()) as {
          thumbnails?: { label: string; name: string; url: string }[];
        };
        if (cancelled || !body.thumbnails) return;
        const cover = body.thumbnails.find((t) => t.label === "cover");
        if (cover) setExistingCoverUrl(cover.url);
        const aiThumbs = body.thumbnails
          .filter((t) => t.label !== "cover")
          .map((t) => ({
            label: t.label,
            url: t.url,
            reason: "Restored from previous run",
          }));
        if (aiThumbs.length > 0) setThumbnails(aiThumbs);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  const generate = async () => {
    setBusy(true);
    setError(null);
    setThumbnails([]);
    try {
      setStage("Fetching video URL…");
      const sigRes = await fetch(`/api/files/${fileId}/download`, { method: "POST" });
      if (!sigRes.ok) throw new Error(`signed URL: ${sigRes.status}`);
      const { signedUrl } = (await sigRes.json()) as { signedUrl: string };

      setStage("Loading video…");
      const frames = await extractFrames(signedUrl, FRAME_COUNT);

      setStage("Asking Claude to pick the best 3…");
      const apiRes = await fetch("/api/ai/thumbnails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId, framesBase64: frames }),
      });
      if (!apiRes.ok) {
        const body = await apiRes.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? `HTTP ${apiRes.status}`);
      }
      const body = (await apiRes.json()) as { thumbnails: Thumbnail[] };
      setThumbnails(body.thumbnails);
      setStage("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={generate}
          disabled={busy}
          className="px-4 py-2 rounded-[8px] bg-accent text-white text-[13px] font-medium disabled:opacity-60"
        >
          {busy ? "Generating…" : thumbnails.length > 0 ? "Regenerate" : "Generate thumbnails"}
        </button>
        {busy && stage ? (
          <span className="text-[12px] text-text-muted">{stage}</span>
        ) : null}
      </div>

      {error ? (
        <div className="mb-4 p-3 rounded-[10px] bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-[12px] text-[#f87171]">
          {error}
        </div>
      ) : null}

      {thumbnails.length === 0 ? (
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="aspect-video rounded-lg bg-gradient-to-br from-[#a855f7] to-[#ec4899] border border-border-strong flex items-center justify-center display text-[18px] text-white/70"
            >
              {busy ? "Working…" : `Variant ${i}`}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {thumbnails.map((t) => (
            <div key={t.label} className="space-y-2">
              <div className="aspect-video rounded-lg overflow-hidden border border-border-strong bg-bg-elev-3">
                <img
                  src={t.url}
                  alt={t.label}
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <div className="text-[12px] font-medium">{LABEL_TEXT[t.label] ?? t.label}</div>
                <div className="text-[11px] text-text-muted">{t.reason}</div>
                <a
                  href={t.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-accent-2 underline mt-1 inline-block"
                >
                  Open full
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-4 text-[11px] text-text-dim">
        Extracts {FRAME_COUNT} frames at evenly-spaced timestamps. Claude Sonnet 4.5 picks
        the 3 best — one with all speakers and a close-up of each. Stored in B2 alongside the video.
      </p>

      {thumbnails.length > 0 ? (
        <div className="mt-8 pt-6 border-t border-border">
          <h3 className="display text-[18px] mb-1">Cover art composer</h3>
          <p className="text-[12px] text-text-muted mb-4">
            Pick one of the photos above (or upload your own), add a banner + title, save as your podcast cover art. Becomes the YouTube thumbnail when you publish.
          </p>
          <CoverArtComposer
            fileId={fileId}
            thumbnails={thumbnails}
            defaultTitle={aiTitle}
            existingCoverUrl={existingCoverUrl}
          />
        </div>
      ) : null}
    </div>
  );
}

async function extractFrames(videoUrl: string, count: number): Promise<string[]> {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.src = videoUrl;

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("video load failed"));
  });

  const duration = video.duration;
  if (!isFinite(duration) || duration < 0.1) {
    throw new Error("video duration is 0");
  }

  const canvas = document.createElement("canvas");
  const aspect = video.videoHeight / Math.max(1, video.videoWidth);
  canvas.width = FRAME_WIDTH;
  canvas.height = Math.round(FRAME_WIDTH * aspect);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");

  const frames: string[] = [];
  // Sample between 5% and 95% of duration to avoid intros / outros
  for (let i = 0; i < count; i++) {
    const t = duration * (0.05 + (0.9 * i) / (count - 1));
    await seekTo(video, t);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    const b64 = dataUrl.split(",")[1] ?? "";
    frames.push(b64);
  }
  video.remove();
  return frames;
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      resolve();
    };
    const onError = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      reject(new Error("seek error"));
    };
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.currentTime = Math.min(time, Math.max(0, video.duration - 0.05));
  });
}
