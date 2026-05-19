// Browser-side YouTube resumable upload.
//
// Flow:
//   1. Server starts a resumable session, gives us a sessionUri + video URL.
//   2. We stream-fetch the video from B2 and PUT it to YouTube in chunks.
//   3. On success, YouTube returns the video object → tell server we're done.

export interface InitResponse {
  sessionUri: string;
  videoUrl: string;
  sizeBytes: number;
  contentType: string;
  title: string;
  vidType: "long" | "short";
  publishAt: string | null;
  visibility: "public" | "unlisted" | "private";
  channelId: string;
}

export interface UploadProgress {
  uploaded: number;
  total: number;
  phase: "fetching" | "uploading" | "finalizing" | "done" | "error";
  message?: string;
}

const CHUNK_SIZE = 8 * 1024 * 1024; // 8 MiB

export async function uploadToYouTube(
  init: InitResponse,
  signal: AbortSignal,
  onProgress: (p: UploadProgress) => void,
): Promise<{ videoId: string }> {
  onProgress({ uploaded: 0, total: init.sizeBytes, phase: "fetching" });

  // Pull the video from B2 once, into a single Blob. For >5GB we'd need
  // true streaming; B2 supports HTTP range requests so this can become
  // proper chunked streaming later.
  const b2Res = await fetch(init.videoUrl, { signal });
  if (!b2Res.ok) {
    throw new Error(`B2 fetch failed: ${b2Res.status}`);
  }
  const blob = await b2Res.blob();
  if (blob.size === 0) throw new Error("empty B2 response");

  onProgress({ uploaded: 0, total: blob.size, phase: "uploading" });

  let offset = 0;
  let videoId: string | null = null;

  while (offset < blob.size) {
    const end = Math.min(offset + CHUNK_SIZE, blob.size);
    const chunk = blob.slice(offset, end);
    const isLast = end === blob.size;
    const res = await fetch(init.sessionUri, {
      method: "PUT",
      headers: {
        "Content-Length": String(chunk.size),
        "Content-Range": `bytes ${offset}-${end - 1}/${blob.size}`,
      },
      body: chunk,
      signal,
    });

    if (res.status === 308) {
      // Resume incomplete — YouTube returns Range header indicating bytes received
      const range = res.headers.get("range");
      if (range) {
        const m = range.match(/bytes=0-(\d+)/);
        if (m) offset = parseInt(m[1], 10) + 1;
        else offset = end;
      } else {
        offset = end;
      }
      onProgress({ uploaded: offset, total: blob.size, phase: "uploading" });
      continue;
    }

    if (res.ok && isLast) {
      const body = (await res.json()) as { id?: string };
      videoId = body.id ?? null;
      break;
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`upload PUT ${res.status}: ${text.slice(0, 300)}`);
    }

    offset = end;
    onProgress({ uploaded: offset, total: blob.size, phase: "uploading" });
  }

  if (!videoId) throw new Error("youtube did not return videoId");
  onProgress({ uploaded: blob.size, total: blob.size, phase: "finalizing" });
  return { videoId };
}
