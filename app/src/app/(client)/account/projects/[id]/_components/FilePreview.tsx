"use client";

// Inline preview thumbnail for the file list. For videos we lean on
// `<video preload="metadata">` which paints the first decoded frame as
// soon as the browser has enough of the file — no server-side ffmpeg
// needed. Falls back to a type icon for audio / other binaries.

import { useEffect, useRef } from "react";
import type { FileItem } from "@/lib/types";

function clientPublicUrl(key: string): string {
  const base =
    process.env.NEXT_PUBLIC_B2_DOWNLOAD_URL ?? "https://f006.backblazeb2.com";
  const bucket = process.env.NEXT_PUBLIC_B2_BUCKET ?? "";
  const path = key.split("/").map(encodeURIComponent).join("/");
  return `${base}/file/${encodeURIComponent(bucket)}/${path}?cb=v3`;
}

export function FilePreview({
  file,
  size = "md",
}: {
  file: FileItem;
  size?: "sm" | "md" | "lg";
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const isVideo = file.mimeType.startsWith("video/");
  const isImage = file.mimeType.startsWith("image/");
  const url = clientPublicUrl(file.backblazeKey);

  // Seek a fraction of a second into the video — some encoders open
  // with a black frame, so jumping to ~0.5s reliably surfaces real
  // content for the poster.
  useEffect(() => {
    if (!isVideo) return;
    const v = ref.current;
    if (!v) return;
    function nudge() {
      if (!v) return;
      try {
        v.currentTime = Math.min(0.5, (v.duration ?? 1) * 0.05);
      } catch {
        /* seek before metadata is sometimes rejected; retry handler below catches it */
      }
    }
    v.addEventListener("loadedmetadata", nudge);
    return () => v.removeEventListener("loadedmetadata", nudge);
  }, [isVideo]);

  const dimClass =
    size === "sm"
      ? "w-12 h-12"
      : size === "lg"
        ? "aspect-video w-full"
        : "w-20 h-20";

  if (isVideo) {
    return (
      <div className={`${dimClass} rounded-[8px] overflow-hidden bg-black shrink-0`}>
        <video
          ref={ref}
          src={url}
          muted
          playsInline
          preload="metadata"
          // contain (not cover) so portrait 9:16 clips show the full
          // frame instead of being zoomed in on the chest. Black bars
          // on the sides are intentional.
          className="w-full h-full object-contain"
        />
      </div>
    );
  }
  if (isImage) {
    return (
      <div className={`${dimClass} rounded-[8px] overflow-hidden bg-black shrink-0`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" loading="lazy" className="w-full h-full object-contain" />
      </div>
    );
  }
  // Generic placeholder — audio + other binaries don't have a visual
  // preview, so just show the extension in a tile.
  const ext = (file.name.split(".").pop() ?? "").toUpperCase().slice(0, 4);
  return (
    <div
      className={`${dimClass} rounded-[8px] bg-bg-elev-3 flex items-center justify-center text-text-muted shrink-0`}
    >
      <span className="text-[10px] font-mono">{ext || "FILE"}</span>
    </div>
  );
}
