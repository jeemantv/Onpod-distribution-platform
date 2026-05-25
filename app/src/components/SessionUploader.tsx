"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadFileToStudio, type UploadProgress } from "@/lib/studio-uploader";
import type { Bucket, StudioSlug } from "@/lib/studio";
import type { FileType } from "@/lib/types";
import { encodeFileId } from "@/lib/b2";

type Props = {
  studio: StudioSlug;
  bucket: Bucket;
  folder: string;
  // When set, the uploader tags each finished file with this FileType
  // via /api/files/[fileId]/meta so it lands under the right tab in
  // FilePortal. Caller passes the currently-active tab here so an
  // upload while viewing "Clips" shows up under Clips, etc.
  defaultType?: FileType;
};

export function SessionUploader({ studio, bucket, folder, defaultType }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const result = await uploadFileToStudio({
          file,
          studio,
          bucket,
          folder,
          onProgress: setProgress,
        });
        // Stamp the file with the current tab's type so classifyByFilename's
        // best-guess doesn't decide for us. Soft-fail — type-stamp failure
        // shouldn't fail the whole upload.
        if (defaultType && result.key) {
          try {
            await fetch(`/api/files/${encodeFileId(result.key)}/meta`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ type: defaultType }),
            });
          } catch (err) {
            console.warn("[SessionUploader] type-stamp failed", (err as Error).message);
          }
        }
      }
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div
      className="border-2 border-dashed border-border rounded-[12px] p-6 text-center bg-bg-elev"
      onDragOver={(e) => {
        e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        void handleFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <p className="text-[13px] text-text-muted">
        {busy
          ? `Uploading ${progress?.filename ?? "…"} (${progress
              ? Math.round((progress.done / progress.total) * 100)
              : 0}%)`
          : defaultType
            ? `Drop files to add to ${defaultType} tab, or`
            : "Drop files here, or"}
      </p>
      <button
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="mt-2 px-4 py-2 rounded-[10px] bg-accent text-white text-[13px] disabled:opacity-50"
      >
        Choose files
      </button>
      {error ? <p className="mt-3 text-[12px] text-danger">{error}</p> : null}
    </div>
  );
}
