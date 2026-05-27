// Per-studio customizable file statuses. Replaces the hardcoded
// pending/approved/rejected enum with a dynamic list — editors and
// admins can rename, recolor, reorder, add, or archive statuses.
//
// Read-side compat: if a file_meta row only has approval_status set
// (legacy), we map it to the matching status row by legacy_value.

import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "./db";
import { fileStatuses, type FileStatusRow } from "./db/schema";

export interface FileStatus {
  id: string;
  studioSlug: string;
  label: string;
  color: string;
  position: number;
  legacyValue: string | null;
  isDefault: boolean;
}

// The seeded defaults every studio gets on first load. Editors can
// rename/recolor/delete these; if they delete the "default" one, the
// next status in the list becomes the default automatically.
const SEED_DEFAULTS: Array<Omit<FileStatus, "id" | "studioSlug">> = [
  { label: "Not started", color: "#6b7280", position: 0, legacyValue: null, isDefault: true },
  { label: "Ready for approval", color: "#a855f7", position: 1, legacyValue: "pending", isDefault: false },
  { label: "Approved", color: "#10b981", position: 2, legacyValue: "approved", isDefault: false },
  { label: "In revision", color: "#f59e0b", position: 3, legacyValue: "rejected", isDefault: false },
];

function toView(r: FileStatusRow): FileStatus {
  return {
    id: r.id,
    studioSlug: r.studioSlug,
    label: r.label,
    color: r.color,
    position: r.position,
    legacyValue: r.legacyValue,
    isDefault: r.isDefault,
  };
}

async function seedFor(studioSlug: string): Promise<void> {
  await db.insert(fileStatuses).values(
    SEED_DEFAULTS.map((s) => ({
      studioSlug,
      label: s.label,
      color: s.color,
      position: s.position,
      legacyValue: s.legacyValue,
      isDefault: s.isDefault,
    })),
  );
}

/**
 * Returns the active (non-archived) status list for a studio. Seeds the
 * defaults the first time a studio is queried.
 */
export async function listStatusesFor(studioSlug: string): Promise<FileStatus[]> {
  const norm = studioSlug || "_default";
  const rows = await db
    .select()
    .from(fileStatuses)
    .where(and(eq(fileStatuses.studioSlug, norm), isNull(fileStatuses.archivedAt)))
    .orderBy(asc(fileStatuses.position));
  if (rows.length === 0) {
    await seedFor(norm);
    const again = await db
      .select()
      .from(fileStatuses)
      .where(and(eq(fileStatuses.studioSlug, norm), isNull(fileStatuses.archivedAt)))
      .orderBy(asc(fileStatuses.position));
    return again.map(toView);
  }
  return rows.map(toView);
}

export async function getStatusById(id: string): Promise<FileStatus | null> {
  const [row] = await db
    .select()
    .from(fileStatuses)
    .where(eq(fileStatuses.id, id))
    .limit(1);
  return row ? toView(row) : null;
}

export async function createStatus(input: {
  studioSlug: string;
  label: string;
  color: string;
  position?: number;
}): Promise<FileStatus> {
  const existing = await listStatusesFor(input.studioSlug);
  const position =
    input.position ??
    (existing.length === 0 ? 0 : Math.max(...existing.map((s) => s.position)) + 1);
  const [row] = await db
    .insert(fileStatuses)
    .values({
      studioSlug: input.studioSlug,
      label: input.label,
      color: input.color,
      position,
      legacyValue: null,
      isDefault: false,
    })
    .returning();
  return toView(row);
}

export async function updateStatus(
  id: string,
  patch: { label?: string; color?: string; position?: number; isDefault?: boolean },
): Promise<FileStatus | null> {
  const target = await getStatusById(id);
  if (!target) return null;

  // Only one default per studio — flip the others off first.
  if (patch.isDefault === true) {
    await db
      .update(fileStatuses)
      .set({ isDefault: false })
      .where(eq(fileStatuses.studioSlug, target.studioSlug));
  }
  const [row] = await db
    .update(fileStatuses)
    .set({
      ...(patch.label !== undefined ? { label: patch.label } : {}),
      ...(patch.color !== undefined ? { color: patch.color } : {}),
      ...(patch.position !== undefined ? { position: patch.position } : {}),
      ...(patch.isDefault !== undefined ? { isDefault: patch.isDefault } : {}),
    })
    .where(eq(fileStatuses.id, id))
    .returning();
  return row ? toView(row) : null;
}

export async function archiveStatus(id: string): Promise<boolean> {
  const target = await getStatusById(id);
  if (!target) return false;
  await db
    .update(fileStatuses)
    .set({ archivedAt: new Date() })
    .where(eq(fileStatuses.id, id));
  // If we just archived the default, promote the lowest-position remaining one.
  if (target.isDefault) {
    const remaining = await listStatusesFor(target.studioSlug);
    if (remaining.length > 0) {
      await db
        .update(fileStatuses)
        .set({ isDefault: true })
        .where(eq(fileStatuses.id, remaining[0].id));
    }
  }
  return true;
}

/**
 * Resolve a file's current status given its row from file_meta.
 * Priority: status_id → legacy approval_status → studio default → null.
 */
export function resolveCurrent(
  statusList: FileStatus[],
  meta: { statusId: string | null; approvalStatus: string | null },
): FileStatus | null {
  if (meta.statusId) {
    return statusList.find((s) => s.id === meta.statusId) ?? null;
  }
  if (meta.approvalStatus) {
    return statusList.find((s) => s.legacyValue === meta.approvalStatus) ?? null;
  }
  return statusList.find((s) => s.isDefault) ?? null;
}
