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
  let bytesUploaded = 0;

  for (const part of init.parts) {
    const start = (part.partNumber - 1) * init.partSizeBytes;
    const end = Math.min(file.size, start + init.partSizeBytes);
    const slice = file.slice(start, end);
    const res = await fetch(part.signedUrl, {
      method: "PUT",
      body: slice,
    });
    if (!res.ok) {
      throw new Error(`part ${part.partNumber} failed: ${res.status}`);
    }
    const etag = res.headers.get("etag") ?? "";
    completedParts.push({ partNumber: part.partNumber, etag });
    bytesUploaded += slice.size;
    onProgress?.({ filename: file.name, done: bytesUploaded, total: file.size });
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
