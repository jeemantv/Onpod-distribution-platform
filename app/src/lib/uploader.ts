export interface UploadInit {
  uploadId: string;
  key: string;
  parts: { partNumber: number; signedUrl: string }[];
  partSizeBytes: number;
}

export interface UploadProgress {
  uploadedBytes: number;
  totalBytes: number;
  partsDone: number;
  totalParts: number;
}

export interface UploadResult {
  file: {
    id: string;
    projectId: string;
    name: string;
    type: "raw" | "edited" | "clip" | "asset";
    mimeType: string;
    sizeBytes: number;
    backblazeKey: string;
    uploadedAt: string;
    approvalStatus: "none";
    publishStates: never[];
    downloadCount: 0;
  };
}

export async function uploadFile(
  projectId: string,
  file: File,
  opts: { onProgress?: (p: UploadProgress) => void; signal?: AbortSignal } = {},
): Promise<UploadResult> {
  const initRes = await fetch(`/api/projects/${projectId}/files/upload-init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      sizeBytes: file.size,
      mimeType: file.type || "application/octet-stream",
    }),
    signal: opts.signal,
  });
  if (!initRes.ok) {
    const body = await initRes.text();
    throw new Error(`upload-init failed: ${initRes.status} ${body}`);
  }
  const init = (await initRes.json()) as UploadInit;

  const totalParts = init.parts.length;
  const totalBytes = file.size;
  const partETags: { partNumber: number; etag: string }[] = [];
  let uploadedBytes = 0;
  let partsDone = 0;

  try {
    for (const p of init.parts) {
      const start = (p.partNumber - 1) * init.partSizeBytes;
      const end = Math.min(start + init.partSizeBytes, file.size);
      const blob = file.slice(start, end);

      const etag = await uploadPart(p.signedUrl, blob, opts.signal);
      partETags.push({ partNumber: p.partNumber, etag });

      uploadedBytes += blob.size;
      partsDone += 1;
      opts.onProgress?.({ uploadedBytes, totalBytes, partsDone, totalParts });
    }
  } catch (err) {
    await fetch(`/api/projects/${projectId}/files/upload-abort`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: init.key, uploadId: init.uploadId }),
    }).catch(() => {});
    throw err;
  }

  const completeRes = await fetch(
    `/api/projects/${projectId}/files/upload-complete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: init.key,
        uploadId: init.uploadId,
        parts: partETags,
      }),
      signal: opts.signal,
    },
  );
  if (!completeRes.ok) {
    const body = await completeRes.text();
    throw new Error(`upload-complete failed: ${completeRes.status} ${body}`);
  }
  return (await completeRes.json()) as UploadResult;
}

async function uploadPart(
  signedUrl: string,
  blob: Blob,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(signedUrl, {
    method: "PUT",
    body: blob,
    signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`PUT part failed: ${res.status} ${body}`);
  }
  const etag = res.headers.get("etag");
  if (!etag) throw new Error("missing ETag in PUT response");
  return etag.replace(/^"|"$/g, "");
}

export function formatProgress(p: UploadProgress): string {
  const pct = Math.round((p.uploadedBytes / Math.max(1, p.totalBytes)) * 100);
  const mb = (b: number) => (b / 1024 / 1024).toFixed(1);
  return `${pct}% · ${mb(p.uploadedBytes)} / ${mb(p.totalBytes)} MB · part ${p.partsDone}/${p.totalParts}`;
}
