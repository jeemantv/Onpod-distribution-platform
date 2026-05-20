// Revision notes per video file. Stored as a B2 sidecar so it survives
// serverless and lives next to the file forever.
//
//   {videoKey}.revisions.json
//
// Shape:
//   {
//     status: "open" | "in_review" | "completed",
//     notes: RevisionNote[],
//     reviewSentAt?: number,
//     assignedEditorEmail?: string,
//     createdAt: number,
//     updatedAt: number,
//   }

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { b2, bucket } from "./b2";

export const REVISIONS_SUFFIX = ".revisions.json";

export interface RevisionNote {
  id: string;
  // Frame-accurate timestamp in seconds (float). Negative => global note.
  timeSeconds: number;
  text: string;
  status: "open" | "done";
  createdByEmail: string;
  createdByName: string;
  createdAt: number;
  doneAt?: number;
  doneByEmail?: string;
}

export interface RevisionFile {
  status: "open" | "in_review" | "completed";
  notes: RevisionNote[];
  reviewSentAt?: number;
  assignedEditorEmail?: string;
  createdAt: number;
  updatedAt: number;
}

function key(videoKey: string): string {
  return videoKey + REVISIONS_SUFFIX;
}

export async function getRevisions(videoKey: string): Promise<RevisionFile | null> {
  try {
    const res = await b2.send(
      new GetObjectCommand({ Bucket: bucket, Key: key(videoKey) }),
    );
    const text = await res.Body?.transformToString();
    if (!text) return null;
    return JSON.parse(text) as RevisionFile;
  } catch {
    return null;
  }
}

export async function saveRevisions(
  videoKey: string,
  data: RevisionFile,
): Promise<void> {
  await b2.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key(videoKey),
      Body: JSON.stringify({ ...data, updatedAt: Date.now() }),
      ContentType: "application/json",
      CacheControl: "no-cache, no-store, must-revalidate",
    }),
  );
}

export async function deleteRevisions(videoKey: string): Promise<void> {
  await b2
    .send(new DeleteObjectCommand({ Bucket: bucket, Key: key(videoKey) }))
    .catch(() => {});
}

export function emptyRevisions(): RevisionFile {
  const now = Date.now();
  return {
    status: "open",
    notes: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function newNoteId(): string {
  return `n_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
