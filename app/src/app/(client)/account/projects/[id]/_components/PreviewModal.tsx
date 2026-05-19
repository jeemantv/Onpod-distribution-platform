"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import type { FileItem } from "@/lib/types";

export function PreviewModal({
  file,
  onClose,
}: {
  file: FileItem;
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
    <Modal title="Preview" subtitle={file.name} onClose={onClose} size="xl">
      {error ? (
        <div className="text-[13px] text-danger">{error}</div>
      ) : !url ? (
        <div className="text-[13px] text-text-muted">Generating signed URL…</div>
      ) : isVideo ? (
        <video
          src={url}
          controls
          autoPlay
          className="w-full max-h-[70vh] rounded-lg bg-black"
        />
      ) : isAudio ? (
        <audio src={url} controls autoPlay className="w-full" />
      ) : isImage ? (
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
