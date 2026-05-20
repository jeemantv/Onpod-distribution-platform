// Server-side helpers that read studio/bucket/session structure from B2
// using delimited list calls. Keeps page loads cheap (1 list per drill-down).

import {
  listFiles,
  listFolders,
  publicUrl,
} from "./b2";
import {
  BUCKETS,
  STUDIO_ROOT,
  STUDIO_SLUGS,
  bucketPrefix,
  parseSessionFolder,
  sessionBelongsToEmail,
  studioPrefix,
  type Bucket,
  type ParsedSession,
  type StudioSlug,
} from "./studio";

export interface StudioSummary {
  slug: StudioSlug;
  buckets: Record<Bucket, { sessionCount: number; sizeBytes: number }>;
}

export interface SessionSummary {
  studio: StudioSlug;
  bucket: Bucket;
  folder: string;
  parsed: ParsedSession | null;
  fileCount: number;
  sizeBytes: number;
  lastModified: string | null;
}

export interface SessionFile {
  key: string;
  filename: string;
  sizeBytes: number;
  lastModified: string | null;
  url: string;
}

/**
 * Fast top-level summary: how many sessions + total size per bucket in each studio.
 * Walks each studio with 1 listFiles call (one prefix scan per studio).
 */
export async function summarizeStudios(): Promise<StudioSummary[]> {
  const out: StudioSummary[] = [];
  for (const slug of STUDIO_SLUGS) {
    const items = await listFiles(studioPrefix(slug));
    const buckets: StudioSummary["buckets"] = {
      clients: { sessionCount: 0, sizeBytes: 0 },
      unmatched: { sessionCount: 0, sizeBytes: 0 },
      raw: { sessionCount: 0, sizeBytes: 0 },
      "to-delete": { sessionCount: 0, sizeBytes: 0 },
    };
    const seenFolders: Record<Bucket, Set<string>> = {
      clients: new Set(),
      unmatched: new Set(),
      raw: new Set(),
      "to-delete": new Set(),
    };
    for (const item of items) {
      // key = studios/{slug}/{bucket}/{maybeFolder}/...
      const rel = item.key.slice(studioPrefix(slug).length);
      const parts = rel.split("/");
      const bucketName = parts[0] as Bucket;
      if (!BUCKETS.includes(bucketName)) continue;
      const folder = parts[1] ?? "";
      if (folder) seenFolders[bucketName].add(folder);
      buckets[bucketName].sizeBytes += item.sizeBytes;
    }
    for (const b of BUCKETS) {
      buckets[b].sessionCount = seenFolders[b].size;
    }
    out.push({ slug, buckets });
  }
  return out;
}

export async function listSessionsInBucket(
  studio: StudioSlug,
  bucket: Bucket,
): Promise<SessionSummary[]> {
  const prefix = bucketPrefix(studio, bucket);
  const folders = await listFolders(prefix);

  const summaries: SessionSummary[] = [];
  for (const folderPrefix of folders) {
    const folder = folderPrefix.slice(prefix.length, -1);
    const items = await listFiles(folderPrefix);
    let last: Date | undefined;
    let size = 0;
    for (const item of items) {
      size += item.sizeBytes;
      if (item.lastModified && (!last || item.lastModified > last)) {
        last = item.lastModified;
      }
    }
    summaries.push({
      studio,
      bucket,
      folder,
      parsed: parseSessionFolder(folder),
      fileCount: items.length,
      sizeBytes: size,
      lastModified: last ? last.toISOString() : null,
    });
  }

  summaries.sort((a, b) => (b.lastModified ?? "").localeCompare(a.lastModified ?? ""));
  return summaries;
}

export async function listSessionFiles(
  studio: StudioSlug,
  bucket: Bucket,
  folder: string,
): Promise<SessionFile[]> {
  const prefix = `${bucketPrefix(studio, bucket)}${folder}/`;
  const items = await listFiles(prefix);
  return items
    .map((item) => ({
      key: item.key,
      filename: item.key.slice(prefix.length),
      sizeBytes: item.sizeBytes,
      lastModified: item.lastModified ? item.lastModified.toISOString() : null,
      url: publicUrl(item.key),
    }))
    .sort((a, b) => a.filename.localeCompare(b.filename));
}

/**
 * Sessions owned by the given client email. Walks all studio "clients/"
 * folders. Cheap in practice (4 list calls, one per studio).
 */
export async function listClientSessions(email: string): Promise<SessionSummary[]> {
  const out: SessionSummary[] = [];
  for (const slug of STUDIO_SLUGS) {
    const prefix = bucketPrefix(slug, "clients");
    const folders = await listFolders(prefix);
    for (const folderPrefix of folders) {
      const folder = folderPrefix.slice(prefix.length, -1);
      if (!sessionBelongsToEmail(folder, email)) continue;
      const items = await listFiles(folderPrefix);
      let last: Date | undefined;
      let size = 0;
      for (const item of items) {
        size += item.sizeBytes;
        if (item.lastModified && (!last || item.lastModified > last)) {
          last = item.lastModified;
        }
      }
      out.push({
        studio: slug,
        bucket: "clients",
        folder,
        parsed: parseSessionFolder(folder),
        fileCount: items.length,
        sizeBytes: size,
        lastModified: last ? last.toISOString() : null,
      });
    }
  }
  out.sort((a, b) => (b.lastModified ?? "").localeCompare(a.lastModified ?? ""));
  return out;
}

export { STUDIO_ROOT };
