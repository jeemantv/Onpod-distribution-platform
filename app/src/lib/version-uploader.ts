// Browser-side multipart uploader for a new version of an existing
// video file. Pairs with /api/admin/upload-version/{init,complete}.

interface InitResponse {
  uploadId: string;
  key: string;
  parts: { partNumber: number; signedUrl: string }[];
  partSizeBytes: number;
  versionNumber: number;
}

export interface UploadProgress {
  filename: string;
  done: number;
  total: number;
  versionNumber: number;
}

export async function uploadNewVersion(args: {
  sourceFileId: string;
  file: File;
  note?: string;
  onProgress?: (p: UploadProgress) => void;
}): Promise<{ versionNumber: number; key: string }> {
  const { sourceFileId, file, note, onProgress } = args;

  const initRes = await fetch("/api/admin/upload-version/init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sourceFileId,
      filename: file.name,
      sizeBytes: file.size,
      mimeType: file.type || "application/octet-stream",
    }),
  });
  if (!initRes.ok) {
    const t = await initRes.text().catch(() => "");
    throw new Error(`upload-version/init ${initRes.status} ${t.slice(0, 200)}`);
  }
  const init = (await initRes.json()) as InitResponse;

  const completed: { partNumber: number; etag: string }[] = [];
  let bytesUploaded = 0;
  for (const part of init.parts) {
    const start = (part.partNumber - 1) * init.partSizeBytes;
    const end = Math.min(file.size, start + init.partSizeBytes);
    const slice = file.slice(start, end);
    const res = await fetch(part.signedUrl, { method: "PUT", body: slice });
    if (!res.ok) throw new Error(`part ${part.partNumber} failed: ${res.status}`);
    const etag = res.headers.get("etag") ?? "";
    completed.push({ partNumber: part.partNumber, etag });
    bytesUploaded += slice.size;
    onProgress?.({
      filename: file.name,
      done: bytesUploaded,
      total: file.size,
      versionNumber: init.versionNumber,
    });
  }

  const completeRes = await fetch("/api/admin/upload-version/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sourceFileId,
      key: init.key,
      uploadId: init.uploadId,
      parts: completed,
      versionNumber: init.versionNumber,
      note,
      // Preserve the editor's original filename so the row title in the
      // file list matches what they actually uploaded.
      displayFilename: file.name,
    }),
  });
  if (!completeRes.ok) {
    const t = await completeRes.text().catch(() => "");
    throw new Error(
      `upload-version/complete ${completeRes.status} ${t.slice(0, 200)}`,
    );
  }
  return { versionNumber: init.versionNumber, key: init.key };
}
