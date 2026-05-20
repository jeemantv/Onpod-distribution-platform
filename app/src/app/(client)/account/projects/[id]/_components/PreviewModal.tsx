"use client";

// Opens when the user clicks the eye on a file row. For videos, this is
// also where the client requests revisions: VideoReviewer is embedded
// so they can scrub, pause, drop timed notes, and send the review off
// to the assigned editor — all in one modal.

import { useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import { VideoReviewer } from "@/components/VideoReviewer";
import type { FileItem } from "@/lib/types";

export function PreviewModal({
  file,
  currentEmail = "",
  canMarkDone = false,
  onClose,
}: {
  file: FileItem;
  currentEmail?: string;
  canMarkDone?: boolean;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/files/${file.id}/download`, { method: "POST" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { signedUrl } = (await res.json()) as { signedUrl: string };
        if (!cancelled) setUrl(signedUrl);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "preview failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file.id]);

  const isVideo = file.mimeType.startsWith("video/");
  const isAudio = file.mimeType.startsWith("audio/");
  const isImage = file.mimeType.startsWith("image/");

  return (
    <Modal
      title={isVideo ? "Review & request revisions" : "Preview"}
      subtitle={file.name}
      onClose={onClose}
      size="xl"
    >
      {error ? (
        <div className="text-[13px] text-danger">{error}</div>
      ) : !url ? (
        <div className="text-[13px] text-text-muted">Loading…</div>
      ) : isVideo ? (
        <VideoReviewer
          fileId={file.id}
          fileUrl={url}
          fileLabel={file.name}
          canMarkDone={canMarkDone}
          currentEmail={currentEmail}
          hideHeader
          compact
        />
      ) : isAudio ? (
        <audio src={url} controls autoPlay className="w-full" />
      ) : isImage ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={url} alt={file.name} className="max-h-[70vh] mx-auto rounded-lg" />
      ) : (
        <div className="text-[13px] text-text-muted">
          Can&apos;t preview this file type in-browser.{" "}
          <a href={url} className="text-accent underline" download={file.name}>
            Download instead
          </a>
          .
        </div>
      )}
    </Modal>
  );
}
