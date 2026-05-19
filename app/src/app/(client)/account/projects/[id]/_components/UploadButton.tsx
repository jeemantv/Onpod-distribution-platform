"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  uploadFile,
  type UploadProgress,
  formatProgress,
} from "@/lib/uploader";

export function UploadButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState<
    | { name: string; progress: UploadProgress | null; error?: string }
    | null
  >(null);

  const handle = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (const f of Array.from(files)) {
      setActive({ name: f.name, progress: null });
      try {
        await uploadFile(projectId, f, {
          onProgress: (p) => setActive({ name: f.name, progress: p }),
        });
      } catch (err) {
        setActive({
          name: f.name,
          progress: null,
          error: err instanceof Error ? err.message : "upload failed",
        });
        return;
      }
    }
    setActive(null);
    router.refresh();
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handle(e.target.files)}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={!!active && !active.error}
        className="px-3.5 py-2 rounded-[8px] bg-accent hover:opacity-90 disabled:opacity-60 text-white text-[13px] font-medium"
      >
        {active && !active.error ? "Uploading…" : "Upload video"}
      </button>

      {active ? (
        <div className="fixed bottom-6 right-6 z-50 w-[360px] bg-bg-elev-2 border border-border-strong rounded-xl p-4 shadow-modal">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="text-[13px] font-medium truncate">{active.name}</div>
            {active.error ? (
              <button
                onClick={() => setActive(null)}
                className="text-text-muted hover:text-text text-[11px]"
              >
                Dismiss
              </button>
            ) : null}
          </div>
          {active.error ? (
            <div className="text-[12px] text-[#f87171]">{active.error}</div>
          ) : (
            <>
              <div className="text-[11px] text-text-muted">
                {active.progress ? formatProgress(active.progress) : "Initializing…"}
              </div>
              <div className="mt-2 h-1 bg-bg-elev-3 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent transition-all"
                  style={{
                    width: active.progress
                      ? `${Math.round((active.progress.uploadedBytes / active.progress.totalBytes) * 100)}%`
                      : "2%",
                  }}
                />
              </div>
            </>
          )}
        </div>
      ) : null}
    </>
  );
}
