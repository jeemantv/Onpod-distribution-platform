"use client";

// Coordinator: wraps the panel tools + the per-video rows so clicking
// a row's quick-action scrolls to the panel and switches its file
// selector to that file.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SessionVideoRow } from "./SessionVideoRow";
import { SessionAITools } from "./SessionAITools";
import { AIMetadataPanel } from "./AIMetadataPanel";
import { ThumbnailStudio } from "./ThumbnailStudio";
import { OpusClipPanel } from "./OpusClipPanel";
import { PodcastPublish } from "./PodcastPublish";
import type { Bucket, StudioSlug } from "@/lib/studio";

interface FileRow {
  key: string;
  filename: string;
  fileId: string;
  url: string;
  sizeBytes: number;
  lastModified: string | null;
}

type Props = {
  studio: StudioSlug;
  bucket: Bucket;
  folder: string;
  files: FileRow[];
  defaultTitle?: string;
  defaultSubtitle?: string;
  ownerEmail?: string | null;
  podcastSettingsHref?: string;
  canEdit: boolean;
  canDelete: boolean;
};

export function SessionVideoList({
  studio,
  bucket,
  folder,
  files,
  defaultTitle = "",
  defaultSubtitle = "",
  ownerEmail = null,
  podcastSettingsHref = "/settings/podcast",
  canEdit,
  canDelete: _canDelete,
}: Props) {
  const router = useRouter();
  const rows = files.map((f) => ({
    key: f.key,
    filename: f.filename,
    fileId: f.fileId,
    url: f.url,
  }));

  const aiRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const opusRef = useRef<HTMLDivElement>(null);
  const podcastRef = useRef<HTMLDivElement>(null);
  const [focusFileId, setFocusFileId] = useState<string>("");

  function jumpTo(target: "ai" | "thumb" | "opus" | "podcast", fileId: string) {
    setFocusFileId(fileId);
    const map = {
      ai: aiRef.current,
      thumb: thumbRef.current,
      opus: opusRef.current,
      podcast: podcastRef.current,
    } as const;
    const el = map[target];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      // Flash a ring on the target panel briefly
      el.classList.add("ring-2", "ring-accent");
      setTimeout(() => el.classList.remove("ring-2", "ring-accent"), 1400);
    }
  }

  async function trashFile(filename: string) {
    if (!canEdit) return;
    if (!confirm(`Move "${filename}" to the to-delete bucket?`)) return;
    const res = await fetch("/api/admin/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromStudio: studio,
        fromBucket: bucket,
        toStudio: studio,
        toBucket: "to-delete",
        folder,
        filename,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.message || "Move failed.");
      return;
    }
    router.refresh();
  }

  if (files.length === 0) {
    return (
      <div className="bg-bg-elev border border-border rounded-lg p-12 text-center">
        <p className="text-text-muted text-[13px]">No files in this session.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Per-file rows up top */}
      <ul className="space-y-2">
        {files.map((f) => (
          <li key={f.key}>
            <SessionVideoRow
              file={f}
              onSelect={jumpTo}
              canTrash={canEdit && bucket !== "to-delete"}
              onTrash={trashFile}
            />
          </li>
        ))}
      </ul>

      {/* Tool panels with refs so action buttons can scroll-to */}
      <div ref={aiRef} className="rounded-[16px] transition-all">
        <SessionAITools files={rows} />
        <AIMetadataPanel files={rows} focusFileId={focusFileId} />
      </div>
      <div ref={thumbRef} className="rounded-[16px] transition-all">
        <ThumbnailStudio
          files={rows}
          defaultTitle={defaultTitle}
          defaultSubtitle={defaultSubtitle}
          focusFileId={focusFileId}
        />
      </div>
      <div ref={opusRef} className="rounded-[16px] transition-all">
        <OpusClipPanel files={rows} focusFileId={focusFileId} />
      </div>
      <div ref={podcastRef} className="rounded-[16px] transition-all">
        <PodcastPublish
          files={rows}
          ownerEmail={ownerEmail}
          showSettingsHref={podcastSettingsHref}
          focusFileId={focusFileId}
        />
      </div>
    </div>
  );
}
