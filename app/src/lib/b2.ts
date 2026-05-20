import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  CopyObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const region = (process.env.B2_ENDPOINT ?? "").match(/s3\.([^.]+)\.backblazeb2\.com/)?.[1] ?? "us-east-1";

export const b2 = new S3Client({
  region,
  endpoint: process.env.B2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.B2_KEY_ID ?? "",
    secretAccessKey: process.env.B2_APPLICATION_KEY ?? "",
  },
  forcePathStyle: true,
});

export const bucket = process.env.B2_BUCKET ?? "";

export function projectPrefix(userId: string, projectId: string): string {
  return `${userId}/${projectId}/`;
}

export function fileKey(userId: string, projectId: string, filename: string): string {
  return `${userId}/${projectId}/${filename}`;
}

export interface MultipartInit {
  uploadId: string;
  key: string;
  parts: { partNumber: number; signedUrl: string }[];
  partSizeBytes: number;
}

export async function startMultipartUpload(
  key: string,
  contentType: string,
  sizeBytes: number,
): Promise<MultipartInit> {
  const partSizeBytes = 100 * 1024 * 1024;
  const partCount = Math.max(1, Math.ceil(sizeBytes / partSizeBytes));
  if (partCount > 10_000) {
    throw new Error(`File too large: would need ${partCount} parts (max 10,000).`);
  }

  const create = await b2.send(
    new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    }),
  );
  const uploadId = create.UploadId!;

  const parts = await Promise.all(
    Array.from({ length: partCount }, (_, i) => i + 1).map(async (partNumber) => {
      const signedUrl = await getSignedUrl(
        b2,
        new UploadPartCommand({
          Bucket: bucket,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
        }),
        { expiresIn: 60 * 60 * 6 },
      );
      return { partNumber, signedUrl };
    }),
  );

  return { uploadId, key, parts, partSizeBytes };
}

export async function completeMultipartUpload(
  key: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[],
): Promise<{ key: string; etag: string | undefined; sizeBytes: number }> {
  await b2.send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts
          .sort((a, b) => a.partNumber - b.partNumber)
          .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
      },
    }),
  );

  const head = await b2.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  return { key, etag: head.ETag, sizeBytes: head.ContentLength ?? 0 };
}

export async function abortMultipartUpload(key: string, uploadId: string): Promise<void> {
  await b2.send(
    new AbortMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
    }),
  );
}

export async function getDownloadUrl(key: string, expiresInSeconds = 900): Promise<string> {
  return getSignedUrl(
    b2,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: expiresInSeconds },
  );
}

export async function listFiles(prefix: string): Promise<
  { key: string; sizeBytes: number; lastModified: Date | undefined; etag: string | undefined }[]
> {
  const out: { key: string; sizeBytes: number; lastModified: Date | undefined; etag: string | undefined }[] = [];
  let continuationToken: string | undefined;
  do {
    const res = await b2.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );
    for (const obj of res.Contents ?? []) {
      if (!obj.Key) continue;
      out.push({
        key: obj.Key,
        sizeBytes: obj.Size ?? 0,
        lastModified: obj.LastModified,
        etag: obj.ETag,
      });
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);
  return out;
}

export async function deleteFile(key: string): Promise<void> {
  await b2.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/**
 * List "folders" (CommonPrefixes) directly under a prefix. Use Delimiter='/'
 * to get just the immediate children. Returned strings are the full prefix
 * paths including the trailing slash.
 */
export async function listFolders(prefix: string): Promise<string[]> {
  const out: string[] = [];
  let continuationToken: string | undefined;
  do {
    const res = await b2.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        Delimiter: "/",
        ContinuationToken: continuationToken,
      }),
    );
    for (const p of res.CommonPrefixes ?? []) {
      if (p.Prefix) out.push(p.Prefix);
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);
  return out;
}

export async function copyFile(fromKey: string, toKey: string): Promise<void> {
  await b2.send(
    new CopyObjectCommand({
      Bucket: bucket,
      CopySource: `/${bucket}/${encodeURIComponent(fromKey).replace(/%2F/g, "/")}`,
      Key: toKey,
    }),
  );
}

export async function moveFile(fromKey: string, toKey: string): Promise<void> {
  await copyFile(fromKey, toKey);
  await deleteFile(fromKey);
}

export async function movePrefix(fromPrefix: string, toPrefix: string): Promise<number> {
  const items = await listFiles(fromPrefix);
  for (const item of items) {
    const suffix = item.key.slice(fromPrefix.length);
    await moveFile(item.key, `${toPrefix}${suffix}`);
  }
  return items.length;
}

export async function deletePrefix(prefix: string): Promise<number> {
  const items = await listFiles(prefix);
  for (const item of items) {
    await deleteFile(item.key);
  }
  return items.length;
}

export function encodeFileId(key: string): string {
  return Buffer.from(key, "utf8").toString("base64url");
}

export function decodeFileId(fileId: string): string {
  return Buffer.from(fileId, "base64url").toString("utf8");
}

// Bump when bucket CORS rules change so browsers refetch and pick up the
// updated Access-Control-Allow-Origin header instead of a stale no-CORS
// cached response. B2 ignores unknown query params.
const PUBLIC_URL_CACHE_BUST = "v3";

export function publicUrl(key: string): string {
  // For an allPublic bucket on B2 S3-compatible. Works permanently — unlike signed URLs.
  const base = process.env.B2_DOWNLOAD_URL ?? "https://f006.backblazeb2.com";
  const path = key.split("/").map(encodeURIComponent).join("/");
  return `${base}/file/${encodeURIComponent(bucket)}/${path}?cb=${PUBLIC_URL_CACHE_BUST}`;
}

export function classifyByFilename(name: string): "raw" | "edited" | "clip" | "asset" {
  const lower = name.toLowerCase();
  if (/(cam\d|_raw|audio_master|\.wav$)/.test(lower)) return "raw";
  if (/(clip|short)/.test(lower)) return "clip";
  if (/(cover|logo|thumbnail|lower_third|asset|\.png$|\.jpg$|\.jpeg$|\.webp$)/.test(lower)) return "asset";
  if (lower.endsWith(".mp4") || lower.endsWith(".mov")) return "edited";
  return "asset";
}

export function guessMimeType(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    wav: "audio/wav",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    flac: "audio/flac",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    srt: "application/x-subrip",
    pdf: "application/pdf",
  };
  return map[ext] ?? "application/octet-stream";
}
