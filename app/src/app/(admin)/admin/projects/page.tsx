// Real sessions across every assigned studio, sorted by newest first.
// Replaces the legacy mockProjects list — admins + editors now see only
// what's actually in B2 under the studio path scheme.

import { requireEditorOrAdmin } from "@/lib/session";
import { listSessionsInBucket } from "@/lib/studio-store";
import {
  BUCKETS,
  BUCKET_LABEL,
  STUDIO_LABEL,
  STUDIO_SLUGS,
  parseSessionFolder,
  type Bucket,
  type StudioSlug,
} from "@/lib/studio";
import {
  loadEditorScope,
  sessionVisibleToEditor,
  studioVisibleToEditor,
} from "@/lib/editor-access";
import { ProjectsTable } from "./_components/ProjectsTable";

export const dynamic = "force-dynamic";

export default async function AdminProjectsPage() {
  const user = requireEditorOrAdmin();
  const scope = await loadEditorScope(user);
  const studios = (scope.studios ?? [...STUDIO_SLUGS]).filter((s) =>
    studioVisibleToEditor(scope, s),
  );

  type Row = {
    studio: StudioSlug;
    bucket: Bucket;
    folder: string;
    clientEmail: string | null;
    fileCount: number;
    sizeBytes: number;
    lastModified: string | null;
  };
  const rows: Row[] = [];
  for (const slug of studios) {
    for (const bucket of BUCKETS) {
      const list = await listSessionsInBucket(slug, bucket);
      for (const s of list) {
        if (!sessionVisibleToEditor(scope, slug, s.folder)) continue;
        rows.push({
          studio: slug,
          bucket,
          folder: s.folder,
          clientEmail: s.parsed?.email ?? null,
          fileCount: s.fileCount,
          sizeBytes: s.sizeBytes,
          lastModified: s.lastModified,
        });
      }
    }
  }
  rows.sort((a, b) =>
    (b.lastModified ?? "").localeCompare(a.lastModified ?? ""),
  );

  return (
    <>
      <h1 className="display text-[36px] mb-2">All projects</h1>
      <p className="text-text-muted text-[13px] mb-8">
        Every session across all assigned studios, newest first.
      </p>

      <ProjectsTable
        rows={rows.map((r) => {
          const parsed = parseSessionFolder(r.folder);
          return {
            studio: r.studio,
            studioLabel: STUDIO_LABEL[r.studio] ?? r.studio,
            bucket: r.bucket,
            bucketLabel: BUCKET_LABEL[r.bucket],
            folder: r.folder,
            clientEmail: r.clientEmail,
            parsedDate: parsed?.date,
            parsedTime: parsed?.time,
            fileCount: r.fileCount,
            sizeBytes: r.sizeBytes,
            lastModified: r.lastModified,
          };
        })}
      />
    </>
  );
}
