// Browser-side multipart uploader for studio paths. Uses the
// /api/admin/upload-init + /api/admin/upload-complete endpoints.

interface InitResponse {
  uploadId: string;
  key: string;
  parts: { partNumber: number; signedUrl: string }[];
  partSizeBytes: number;
}

export interface UploadProgress {
  filename: string;
  done: number;
  total: number;
}

export async function uploadFileToStudio(args: {
  file: File;
  studio: string;
  bucket: string;
  folder?: string;
  onProgress?: (p: UploadProgress) => void;
}): Promise<{ key: string; sizeBytes: number }> {
  const { file, studio, bucket, folder, onProgress } = args;

  const initRes = await fetch("/api/admin/upload-init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      studio,
      bucket,
      folder,
      filename: file.name,
      sizeBytes: file.size,
      mimeType: file.type || "application/octet-stream",
    }),
  });
  if (!initRes.ok) {
    throw new Error(`upload-init failed: ${initRes.status}`);
  }
  const init = (await initRes.json()) as InitResponse;

  const completedParts: { partNumber: number; etag: string }[] = [];
  // Total bytes finished from *prior* parts. `inFlight` is what the
  // currently-uploading part has streamed so far. Sum is the real number.
  let priorBytes = 0;

  for (const part of init.parts) {
    const start = (part.partNumber - 1) * init.partSizeBytes;
    const end = Math.min(file.size, start + init.partSizeBytes);
    const slice = file.slice(start, end);

    // XHR so we can hook upload.onprogress — fetch() exposes no event
    // for upload bytes, so the original implementation jumped from 0%
    // straight to 100% for single-part uploads.
    const etag = await new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", part.signedUrl);
      xhr.upload.onprogress = (ev) => {
        if (!ev.lengthComputable) return;
        onProgress?.({
          filename: file.name,
          done: priorBytes + ev.loaded,
          total: file.size,
        });
      };
      xhr.onload = () => {
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(`part ${part.partNumber} failed: ${xhr.status}`));
          return;
        }
        resolve(xhr.getResponseHeader("etag") ?? "");
      };
      xhr.onerror = () => reject(new Error(`part ${part.partNumber} network error`));
      xhr.onabort = () => reject(new Error(`part ${part.partNumber} aborted`));
      xhr.send(slice);
    });

    completedParts.push({ partNumber: part.partNumber, etag });
    priorBytes += slice.size;
    onProgress?.({ filename: file.name, done: priorBytes, total: file.size });
  }

  const completeRes = await fetch("/api/admin/upload-complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      key: init.key,
      uploadId: init.uploadId,
      parts: completedParts,
    }),
  });
  if (!completeRes.ok) {
    throw new Error(`upload-complete failed: ${completeRes.status}`);
  }
  return completeRes.json();
}
