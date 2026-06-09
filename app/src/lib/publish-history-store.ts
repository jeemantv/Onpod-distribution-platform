// Postgres-backed publish history.

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { publishHistory } from "./db/schema";
import type { PublishAction, PublishPlatform, VidType } from "./types";

export interface PublishHistoryRow {
  id: string;
  userId: string;
  fileId: string;
  fileKey: string;
  fileName: string;
  platform: PublishPlatform;
  action: PublishAction;
  vidType: VidType | null;
  externalId: string | null;
  externalUrl: string | null;
  scheduledFor: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

type DbRow = typeof publishHistory.$inferSelect;

function toRow(r: DbRow): PublishHistoryRow {
  return {
    id: r.id,
    userId: r.userId,
    // No real files table yet — return the B2 key as the file identifier.
    fileId: r.fileKey,
    fileKey: r.fileKey,
    fileName: r.fileName,
    platform: r.platform,
    action: r.action,
    vidType: r.vidType,
    externalId: r.externalId,
    externalUrl: r.externalUrl,
    scheduledFor: r.scheduledFor ? r.scheduledFor.toISOString() : null,
    metadata: (r.metadata ?? {}) as Record<string, unknown>,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function recordPublish(
  row: Omit<PublishHistoryRow, "id" | "createdAt">,
): Promise<PublishHistoryRow> {
  const [r] = await db
    .insert(publishHistory)
    .values({
      userId: row.userId,
      fileKey: row.fileKey,
      fileName: row.fileName,
      platform: row.platform,
      action: row.action,
      vidType: row.vidType,
      externalId: row.externalId,
      externalUrl: row.externalUrl,
      scheduledFor: row.scheduledFor ? new Date(row.scheduledFor) : null,
      metadata: row.metadata,
    })
    .returning();
  return toRow(r);
}

export async function historyForUser(userId: string): Promise<PublishHistoryRow[]> {
  const rows = await db
    .select()
    .from(publishHistory)
    .where(eq(publishHistory.userId, userId))
    .orderBy(desc(publishHistory.createdAt));
  return rows.map(toRow);
}

// The most recent video an auto-post bucket published (for the "Last posted"
// line). Matches on the bucketId we stamp into publish metadata.
export async function latestBucketPost(
  userId: string,
  bucketId: string,
): Promise<{ at: string; url: string | null; fileName: string } | null> {
  const [r] = await db
    .select()
    .from(publishHistory)
    .where(
      and(
        eq(publishHistory.userId, userId),
        sql`${publishHistory.metadata}->>'bucketId' = ${bucketId}`,
      ),
    )
    .orderBy(desc(publishHistory.createdAt))
    .limit(1);
  return r
    ? { at: r.createdAt.toISOString(), url: r.externalUrl, fileName: r.fileName }
    : null;
}

export async function historyForFile(fileKey: string): Promise<PublishHistoryRow[]> {
  const rows = await db
    .select()
    .from(publishHistory)
    .where(eq(publishHistory.fileKey, fileKey))
    .orderBy(desc(publishHistory.createdAt));
  return rows.map(toRow);
}

export async function historyForUserGroupedByFile(
  userId: string,
): Promise<Record<string, PublishHistoryRow[]>> {
  const rows = await historyForUser(userId);
  const out: Record<string, PublishHistoryRow[]> = {};
  for (const r of rows) {
    (out[r.fileKey] ??= []).push(r);
  }
  return out;
}

/**
 * Bulk fetch publish history for a set of B2 keys, grouped by key.
 * Used when rendering a session page so every file row can decorate
 * itself with a "Published — YouTube" badge without N+1 queries.
 */
export async function historyByFileKeys(
  fileKeys: string[],
): Promise<Record<string, PublishHistoryRow[]>> {
  const out: Record<string, PublishHistoryRow[]> = {};
  if (fileKeys.length === 0) return out;
  const rows = await db
    .select()
    .from(publishHistory)
    .where(inArray(publishHistory.fileKey, fileKeys))
    .orderBy(desc(publishHistory.createdAt));
  for (const r of rows) {
    const row = toRow(r);
    (out[row.fileKey] ??= []).push(row);
  }
  return out;
}
