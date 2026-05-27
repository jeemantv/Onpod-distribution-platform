// Postgres-backed per-file overrides (folder type, approval status) when
// the filename alone can't carry the truth. Composite key on
// (user_id, project_id, file_key).

import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { fileMeta } from "./db/schema";
import type { ApprovalStatus, FileType } from "./types";

export interface FileMetaEntry {
  type?: FileType;
  approvalStatus?: ApprovalStatus;
  // FK to file_statuses. Takes precedence over approvalStatus on the
  // read path. When set, indicates the user picked a specific custom
  // (or seeded) status.
  statusId?: string | null;
  updatedAt?: string;
}

export type FileMeta = Record<string, FileMetaEntry>;

export async function getFileMeta(userId: string, projectId: string): Promise<FileMeta> {
  const rows = await db
    .select()
    .from(fileMeta)
    .where(and(eq(fileMeta.ownerId, userId), eq(fileMeta.projectId, projectId)));
  const out: FileMeta = {};
  for (const r of rows) {
    out[r.fileKey] = {
      type: r.type ?? undefined,
      approvalStatus: r.approvalStatus ?? undefined,
      statusId: r.statusId ?? null,
      updatedAt: r.updatedAt.toISOString(),
    };
  }
  return out;
}

export async function setFileMetaEntry(
  userId: string,
  projectId: string,
  fileKey: string,
  entry: FileMetaEntry,
): Promise<FileMeta> {
  const normApproval =
    entry.approvalStatus && entry.approvalStatus !== "none"
      ? entry.approvalStatus
      : null;
  await db
    .insert(fileMeta)
    .values({
      ownerId: userId,
      projectId,
      fileKey,
      type: entry.type ?? null,
      // ApprovalStatus has a "none" sentinel that means "no decision yet" —
      // store that as SQL NULL so the column only holds spec values.
      approvalStatus: normApproval,
      statusId: entry.statusId ?? null,
    })
    .onConflictDoUpdate({
      target: [fileMeta.ownerId, fileMeta.projectId, fileMeta.fileKey],
      // Sparse update so a status-only change doesn't clobber type, etc.
      set: {
        ...(entry.type !== undefined ? { type: entry.type ?? null } : {}),
        ...(entry.approvalStatus !== undefined ? { approvalStatus: normApproval } : {}),
        ...(entry.statusId !== undefined ? { statusId: entry.statusId } : {}),
        updatedAt: new Date(),
      },
    });
  return getFileMeta(userId, projectId);
}

export async function deleteFileMetaEntry(
  userId: string,
  projectId: string,
  fileKey: string,
): Promise<void> {
  await db
    .delete(fileMeta)
    .where(
      and(
        eq(fileMeta.ownerId, userId),
        eq(fileMeta.projectId, projectId),
        eq(fileMeta.fileKey, fileKey),
      ),
    );
}

export const FILE_META_SUFFIX = ".file-meta.json";
