// Aggregates revision sidecars across assigned studios for the
// editor's Reviews inbox. Each entry is one file with open notes.

import { listFiles } from "./b2";
import { bucketPrefix, type StudioSlug } from "./studio";
import { REVISIONS_SUFFIX, getRevisions } from "./revisions-store";
import { parseKey } from "./studio";

export interface ReviewRowSummary {
  studio: StudioSlug;
  sessionFolder: string;
  fileKey: string;
  filename: string;
  status: "open" | "in_review" | "completed";
  openCount: number;
  totalCount: number;
  reviewSentAt: number | null;
  lastUpdate: number;
  // The client whose email is in the session folder
  clientEmail: string | null;
}

export interface SessionRow {
  studio: StudioSlug;
  bucket: "clients" | "unmatched" | "raw" | "to-delete";
  folder: string;
  clientEmail: string | null;
  fileCount: number;
  sizeBytes: number;
  lastModified: string | null;
}

/**
 * Walk each assigned studio's clients/ bucket, find revisions sidecars,
 * and return one row per file that has a revisions record.
 */
export async function listReviewsForStudios(
  studios: StudioSlug[],
): Promise<ReviewRowSummary[]> {
  const out: ReviewRowSummary[] = [];
  for (const slug of studios) {
    const items = await listFiles(bucketPrefix(slug, "clients"));
    const revKeys = items
      .filter((i) => i.key.endsWith(REVISIONS_SUFFIX))
      .map((i) => i.key);
    for (const revKey of revKeys) {
      const videoKey = revKey.slice(0, -REVISIONS_SUFFIX.length);
      const parsed = parseKey(videoKey);
      const data = await getRevisions(videoKey);
      if (!data) continue;
      const open = data.notes.filter((n) => n.status === "open").length;
      out.push({
        studio: slug,
        sessionFolder: parsed.sessionFolder ?? "",
        fileKey: videoKey,
        filename: videoKey.split("/").slice(-1)[0] ?? "",
        status: data.status,
        openCount: open,
        totalCount: data.notes.length,
        reviewSentAt: data.reviewSentAt ?? null,
        lastUpdate: data.updatedAt ?? data.createdAt,
        clientEmail: parsed.parsedSession?.email ?? null,
      });
    }
  }
  // Newest activity first
  out.sort((a, b) => b.lastUpdate - a.lastUpdate);
  return out;
}
