// Frame.io-style version stack for a single video file.
//
// On disk:
//   {base}.mp4              = v1 (the original upload)
//   {base}.v2.mp4           = v2 (next editor pass)
//   {base}.v3.mp4           = …
//   {base}.versions.json    = the version index
//
// Sidecar JSON:
//   {
//     versions: [
//       { n: 1, key: "{base}.mp4",    uploadedAt, uploadedByEmail, note? },
//       { n: 2, key: "{base}.v2.mp4", uploadedAt, uploadedByEmail, note? },
//     ],
//     active: 2,
//   }
//
// We resolve a "canonical key" — the v1 path — for every video, so any
// other code that holds a fileId/key always works against a stable
// identifier. Listings hide the .vN siblings and swap the URL of the
// canonical row to point at the active version.

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { b2, bucket } from "./b2";

export const VERSIONS_SUFFIX = ".versions.json";

export interface VersionEntry {
  n: number;
  key: string;
  uploadedAt: number;
  uploadedByEmail: string;
  uploadedByName?: string;
  note?: string;
}

export interface VersionsFile {
  versions: VersionEntry[];
  active: number;
}

/**
 * Convert any key (v1 or .vN) to its canonical (v1) form.
 *   "studios/x/foo.mp4"       -> "studios/x/foo.mp4"
 *   "studios/x/foo.v3.mp4"    -> "studios/x/foo.mp4"
 */
export function canonicalKey(key: string): string {
  return key.replace(/\.v\d+(\.[A-Za-z0-9]+)$/, "$1");
}

/**
 * True if the key is a non-v1 version sidecar file (foo.v2.mp4 etc).
 */
export function isVersionedKey(key: string): boolean {
  return /\.v\d+\.[A-Za-z0-9]+$/.test(key);
}

export function versionsKey(canonical: string): string {
  return canonical + VERSIONS_SUFFIX;
}

export async function getVersions(
  canonical: string,
): Promise<VersionsFile | null> {
  try {
    const res = await b2.send(
      new GetObjectCommand({ Bucket: bucket, Key: versionsKey(canonical) }),
    );
    const text = await res.Body?.transformToString();
    if (!text) return null;
    return JSON.parse(text) as VersionsFile;
  } catch {
    return null;
  }
}

export async function saveVersions(
  canonical: string,
  data: VersionsFile,
): Promise<void> {
  await b2.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: versionsKey(canonical),
      Body: JSON.stringify(data),
      ContentType: "application/json",
      CacheControl: "no-cache, no-store, must-revalidate",
    }),
  );
}

export async function deleteVersionsSidecar(canonical: string): Promise<void> {
  await b2
    .send(new DeleteObjectCommand({ Bucket: bucket, Key: versionsKey(canonical) }))
    .catch(() => {});
}

/**
 * Returns the version entry currently active for the canonical key.
 * If no versions sidecar exists, the canonical key itself is v1.
 */
export async function resolveActive(canonical: string): Promise<VersionEntry> {
  const data = await getVersions(canonical);
  if (!data) {
    return {
      n: 1,
      key: canonical,
      uploadedAt: 0,
      uploadedByEmail: "",
    };
  }
  const a = data.versions.find((v) => v.n === data.active) ?? data.versions[0];
  return a;
}

/**
 * Compute the key for a new version N (e.g. v2). Inserts ".vN" before
 * the extension: "foo.mp4" + 2 → "foo.v2.mp4".
 */
export function buildVersionedKey(canonical: string, n: number): string {
  const m = canonical.match(/^(.+?)(\.[A-Za-z0-9]+)$/);
  if (!m) return `${canonical}.v${n}`;
  return `${m[1]}.v${n}${m[2]}`;
}

export async function nextVersionNumber(canonical: string): Promise<number> {
  const data = await getVersions(canonical);
  if (!data) return 2; // first new version after the original (which is v1)
  return Math.max(...data.versions.map((v) => v.n)) + 1;
}

export async function appendVersion(
  canonical: string,
  entry: VersionEntry,
  options?: { setActive?: boolean },
): Promise<VersionsFile> {
  const existing = (await getVersions(canonical)) ?? {
    versions: [
      {
        n: 1,
        key: canonical,
        uploadedAt: 0,
        uploadedByEmail: "",
      },
    ],
    active: 1,
  };
  const filtered = existing.versions.filter((v) => v.n !== entry.n);
  const next: VersionsFile = {
    versions: [...filtered, entry].sort((a, b) => a.n - b.n),
    active: options?.setActive === false ? existing.active : entry.n,
  };
  await saveVersions(canonical, next);
  return next;
}

export async function setActive(
  canonical: string,
  n: number,
): Promise<VersionsFile | null> {
  const existing = await getVersions(canonical);
  if (!existing) return null;
  if (!existing.versions.find((v) => v.n === n)) return null;
  const next: VersionsFile = { ...existing, active: n };
  await saveVersions(canonical, next);
  return next;
}
