"use client";

// Opens when the user clicks the eye on a file row. For videos, this is
// also where the client requests revisions and where staff can swap
// versions in-place. The active version's URL is reloaded automatically
// when you switch.

import { useCallback, useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import { VideoReviewer } from "@/components/VideoReviewer";
import { VersionMenu } from "@/components/VersionMenu";
import type { FileItem } from "@/lib/types";

interface VersionsState {
  active: number;
  count: number;
}

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
  const [versionTag, setVersionTag] = useState(0); // bumped on version switch to force reload
  const [versions, setVersions] = useState<VersionsState | null>(null);

  const isVideo = file.mimeType.startsWith("video/");
  const isAudio = file.mimeType.startsWith("audio/");
  const isImage = file.mimeType.startsWith("image/");

  // Refetch the signed URL whenever the active version changes
  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setError(null);
    (async () => {
      try {
        const res = await fetch(`/api/files/${file.id}/download`, {
          method: "POST",
        });
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
  }, [file.id, versionTag]);

  // Probe the versions sidecar so the modal title can show "v2" up top
  // and the VersionMenu starts knowing the state.
  useEffect(() => {
    if (!isVideo) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/files/${file.id}/versions`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          versions: { active: number; versions: { n: number }[] } | null;
        };
        if (cancelled) return;
        if (data.versions) {
          setVersions({
            active: data.versions.active,
            count: data.versions.versions.length,
          });
        } else {
          setVersions({ active: 1, count: 1 });
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file.id, isVideo, versionTag]);

  const onVersionsChanged = useCallback(() => {
    // Bump tag → re-runs the download URL fetch (in case the active
    // version changed) and the versions probe (in case a new one
    // was just uploaded).
    setVersionTag((v) => v + 1);
  }, []);

  const subtitle =
    isVideo && versions
      ? `${file.name} · v${versions.active}${versions.count > 1 ? ` of ${versions.count}` : ""}`
      : file.name;

  return (
    <Modal
      title={isVideo ? "Review & request revisions" : "Preview"}
      subtitle={subtitle}
      onClose={onClose}
      size="xl"
    >
      {isVideo ? (
        <div className="mb-3 flex items-center gap-2 flex-wrap">
          <span className="text-[11px] uppercase tracking-wider text-text-dim">
            Version
          </span>
          <VersionMenu
            fileId={file.id}
            canManage={canMarkDone}
            onChange={onVersionsChanged}
          />
        </div>
      ) : null}

      {error ? (
        <div className="text-[13px] text-danger">{error}</div>
      ) : !url ? (
        <div className="text-[13px] text-text-muted">Loading…</div>
      ) : isVideo ? (
        <VideoReviewer
          key={versionTag}
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
