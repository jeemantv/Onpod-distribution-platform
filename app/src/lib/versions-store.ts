// Postgres-backed Frame.io-style version stack for a single video file.
// Canonical key resolution (canonicalKey/isVersionedKey/buildVersionedKey)
// remains pure-string logic that doesn't need a DB round-trip.

import { and, asc, eq } from "drizzle-orm";
import { db } from "./db";
import { fileVersions } from "./db/schema";

export const VERSIONS_SUFFIX = ".versions.json";

export interface VersionEntry {
  n: number;
  key: string;
  uploadedAt: number;
  uploadedByEmail: string;
  uploadedByName?: string;
  note?: string;
  // The filename the uploader actually picked (e.g. "edit_v2_final.mp4").
  // B2 still stores at the buildVersionedKey path for collision safety,
  // but UI shows this so the row title matches what they edited.
  displayFilename?: string;
}

export interface VersionsFile {
  versions: VersionEntry[];
  active: number;
}

// ---------- Pure string helpers (no DB) ----------

export function canonicalKey(key: string): string {
  return key.replace(/\.v\d+(\.[A-Za-z0-9]+)$/, "$1");
}

export function isVersionedKey(key: string): boolean {
  return /\.v\d+\.[A-Za-z0-9]+$/.test(key);
}

export function versionsKey(canonical: string): string {
  return canonical + VERSIONS_SUFFIX;
}

export function buildVersionedKey(canonical: string, n: number): string {
  const m = canonical.match(/^(.+?)(\.[A-Za-z0-9]+)$/);
  if (!m) return `${canonical}.v${n}`;
  return `${m[1]}.v${n}${m[2]}`;
}

// ---------- DB-backed lookups ----------

type DbRow = typeof fileVersions.$inferSelect;

function entryFromRow(r: DbRow): VersionEntry {
  return {
    n: r.n,
    key: r.backblazeKey,
    uploadedAt: r.uploadedAt.getTime(),
    uploadedByEmail: r.uploadedByEmail,
    uploadedByName: r.uploadedByName ?? undefined,
    note: r.note ?? undefined,
    displayFilename: r.displayFilename ?? undefined,
  };
}

export async function getVersions(canonical: string): Promise<VersionsFile | null> {
  const rows = await db
    .select()
    .from(fileVersions)
    .where(eq(fileVersions.canonicalKey, canonical))
    .orderBy(asc(fileVersions.n));
  if (rows.length === 0) return null;
  const active = rows.find((r) => r.isActive)?.n ?? rows[rows.length - 1].n;
  return { versions: rows.map(entryFromRow), active };
}

export async function deleteVersionsSidecar(canonical: string): Promise<void> {
  await db.delete(fileVersions).where(eq(fileVersions.canonicalKey, canonical));
}

export async function resolveActive(canonical: string): Promise<VersionEntry> {
  const data = await getVersions(canonical);
  if (!data) {
    return { n: 1, key: canonical, uploadedAt: 0, uploadedByEmail: "" };
  }
  return data.versions.find((v) => v.n === data.active) ?? data.versions[0];
}

/**
 * Returns the B2 key for the currently-active version of a file. For
 * v1 (or files with no version history) this is the canonical key
 * itself; for v2+ it's the versioned filename. AI / transcript /
 * approval sidecars hang off this key so they reset cleanly when a
 * new version is uploaded.
 */
export async function activeVideoKey(canonical: string): Promise<string> {
  const active = await resolveActive(canonical).catch(() => null);
  return active && active.n > 1 ? active.key : canonical;
}

export async function nextVersionNumber(canonical: string): Promise<number> {
  const data = await getVersions(canonical);
  if (!data) return 2;
  return Math.max(...data.versions.map((v) => v.n)) + 1;
}

export async function appendVersion(
  canonical: string,
  entry: VersionEntry,
  options?: { setActive?: boolean },
): Promise<VersionsFile> {
  // Ensure v1 exists as a placeholder so callers always see a complete history.
  const existing = await getVersions(canonical);
  if (!existing) {
    await db.insert(fileVersions).values({
      canonicalKey: canonical,
      n: 1,
      backblazeKey: canonical,
      isActive: options?.setActive === false,
      uploadedByEmail: "",
      uploadedAt: new Date(0),
    });
  }

  await db
    .insert(fileVersions)
    .values({
      canonicalKey: canonical,
      n: entry.n,
      backblazeKey: entry.key,
      isActive: false,
      uploadedByEmail: entry.uploadedByEmail,
      uploadedByName: entry.uploadedByName ?? null,
      note: entry.note ?? null,
      displayFilename: entry.displayFilename ?? null,
      uploadedAt: new Date(entry.uploadedAt),
    })
    .onConflictDoUpdate({
      target: [fileVersions.canonicalKey, fileVersions.n],
      set: {
        backblazeKey: entry.key,
        uploadedByEmail: entry.uploadedByEmail,
        uploadedByName: entry.uploadedByName ?? null,
        note: entry.note ?? null,
        displayFilename: entry.displayFilename ?? null,
        uploadedAt: new Date(entry.uploadedAt),
      },
    });

  if (options?.setActive !== false) {
    await db
      .update(fileVersions)
      .set({ isActive: false })
      .where(eq(fileVersions.canonicalKey, canonical));
    await db
      .update(fileVersions)
      .set({ isActive: true })
      .where(and(eq(fileVersions.canonicalKey, canonical), eq(fileVersions.n, entry.n)));
  }

  const after = await getVersions(canonical);
  if (!after) throw new Error("appendVersion: failed to read back");
  return after;
}

export async function saveVersions(canonical: string, data: VersionsFile): Promise<void> {
  await db.delete(fileVersions).where(eq(fileVersions.canonicalKey, canonical));
  if (data.versions.length === 0) return;
  await db.insert(fileVersions).values(
    data.versions.map((v) => ({
      canonicalKey: canonical,
      n: v.n,
      backblazeKey: v.key,
      isActive: v.n === data.active,
      uploadedByEmail: v.uploadedByEmail,
      uploadedByName: v.uploadedByName ?? null,
      note: v.note ?? null,
      uploadedAt: new Date(v.uploadedAt),
    })),
  );
}

export async function setActive(canonical: string, n: number): Promise<VersionsFile | null> {
  const existing = await getVersions(canonical);
  if (!existing) return null;
  if (!existing.versions.find((v) => v.n === n)) return null;
  await db
    .update(fileVersions)
    .set({ isActive: false })
    .where(eq(fileVersions.canonicalKey, canonical));
  await db
    .update(fileVersions)
    .set({ isActive: true })
    .where(and(eq(fileVersions.canonicalKey, canonical), eq(fileVersions.n, n)));
  return getVersions(canonical);
}
