// Publish-history store, backed by B2 (serverless-safe).

import { readState, writeState } from "./state-store";
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

const KEY = "publish-history.json";

async function readAll(): Promise<PublishHistoryRow[]> {
  return readState<PublishHistoryRow[]>(KEY, []);
}

async function writeAll(rows: PublishHistoryRow[]): Promise<void> {
  await writeState(KEY, rows);
}

export async function recordPublish(
  row: Omit<PublishHistoryRow, "id" | "createdAt">,
): Promise<PublishHistoryRow> {
  const rows = await readAll();
  const full: PublishHistoryRow = {
    ...row,
    id: `ph_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  rows.unshift(full);
  await writeAll(rows);
  return full;
}

export async function historyForUser(userId: string): Promise<PublishHistoryRow[]> {
  const rows = await readAll();
  return rows.filter((r) => r.userId === userId);
}

export async function historyForFile(fileKey: string): Promise<PublishHistoryRow[]> {
  const rows = await readAll();
  return rows.filter((r) => r.fileKey === fileKey);
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
