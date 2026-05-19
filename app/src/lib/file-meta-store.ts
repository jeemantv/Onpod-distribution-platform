// Per-file metadata overrides — folder type, approval status — when we don't
// want to rename the file in B2 but still need to override classifyByFilename.
// Stored per-project in B2 as {userId}/{projectId}/.file-meta.json.

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { b2, bucket } from "./b2";
import type { ApprovalStatus, FileType } from "./types";

const META_FILE = ".file-meta.json";

export interface FileMetaEntry {
  type?: FileType;
  approvalStatus?: ApprovalStatus;
  updatedAt?: string;
}

export type FileMeta = Record<string, FileMetaEntry>;

function metaKey(userId: string, projectId: string): string {
  return `${userId}/${projectId}/${META_FILE}`;
}

export async function getFileMeta(
  userId: string,
  projectId: string,
): Promise<FileMeta> {
  try {
    const res = await b2.send(
      new GetObjectCommand({ Bucket: bucket, Key: metaKey(userId, projectId) }),
    );
    const text = await res.Body?.transformToString();
    if (!text) return {};
    return JSON.parse(text) as FileMeta;
  } catch {
    return {};
  }
}

export async function setFileMetaEntry(
  userId: string,
  projectId: string,
  fileKey: string,
  entry: FileMetaEntry,
): Promise<FileMeta> {
  const meta = await getFileMeta(userId, projectId);
  meta[fileKey] = {
    ...(meta[fileKey] ?? {}),
    ...entry,
    updatedAt: new Date().toISOString(),
  };
  await b2.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: metaKey(userId, projectId),
      Body: JSON.stringify(meta, null, 2),
      ContentType: "application/json",
    }),
  );
  return meta;
}

export async function deleteFileMetaEntry(
  userId: string,
  projectId: string,
  fileKey: string,
): Promise<void> {
  const meta = await getFileMeta(userId, projectId);
  delete meta[fileKey];
  if (Object.keys(meta).length === 0) {
    await b2.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: metaKey(userId, projectId) }),
    );
    return;
  }
  await b2.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: metaKey(userId, projectId),
      Body: JSON.stringify(meta, null, 2),
      ContentType: "application/json",
    }),
  );
}

export const FILE_META_SUFFIX = META_FILE;
