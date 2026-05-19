// File-backed publish history. One row per publish action.
// Path: app/data/publish-history.json (gitignored).

import fs from "fs/promises";
import path from "path";
import type { PublishAction, PublishPlatform, VidType } from "./types";

export interface PublishHistoryRow {
  id: string;
  userId: string;
  fileId: string; // base64url B2 key
  fileKey: string; // raw B2 key, for cross-referencing
  fileName: string;
  platform: PublishPlatform;
  action: PublishAction;
  vidType: VidType | null;
  externalId: string | null;
  externalUrl: string | null;
  scheduledFor: string | null; // ISO
  metadata: Record<string, unknown>;
  createdAt: string;
}

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "publish-history.json");

async function readAll(): Promise<PublishHistoryRow[]> {
  try {
    const text = await fs.readFile(FILE, "utf8");
    return JSON.parse(text) as PublishHistoryRow[];
  } catch {
    return [];
  }
}

async function writeAll(rows: PublishHistoryRow[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(rows, null, 2));
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
