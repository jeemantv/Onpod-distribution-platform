// Archived sessions across every assigned studio. Same B2-derived list
// as /admin/projects, filtered to sessions an editor/admin has archived.
// Unarchiving here sends them back to All projects.

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
import { getSessionStateMap, sessionKey } from "@/lib/session-state-store";
import { ProjectsTable } from "../projects/_components/ProjectsTable";

export const dynamic = "force-dynamic";

export default async function AdminArchivePage() {
  const user = requireEditorOrAdmin();
  const scope = await loadEditorScope(user);
  const studios = (scope.studios ?? [...STUDIO_SLUGS]).filter((s) =>
    studioVisibleToEditor(scope, s),
  );
  const stateMap = await getSessionStateMap();

  type Row = {
    studio: StudioSlug;
    bucket: Bucket;
    folder: string;
    clientEmail: string | null;
    fileCount: number;
    sizeBytes: number;
    lastModified: string | null;
    done: boolean;
  };
  const rows: Row[] = [];
  for (const slug of studios) {
    for (const bucket of BUCKETS) {
      const list = await listSessionsInBucket(slug, bucket);
      for (const s of list) {
        if (!sessionVisibleToEditor(scope, slug, s.folder)) continue;
        const state = stateMap.get(sessionKey(slug, bucket, s.folder));
        if (!state?.archived) continue;
        rows.push({
          studio: slug,
          bucket,
          folder: s.folder,
          clientEmail: s.parsed?.email ?? null,
          fileCount: s.fileCount,
          sizeBytes: s.sizeBytes,
          lastModified: s.lastModified,
          done: state.done,
        });
      }
    }
  }
  rows.sort((a, b) =>
    (b.lastModified ?? "").localeCompare(a.lastModified ?? ""),
  );

  return (
    <>
      <h1 className="display text-[36px] mb-2">Archive</h1>
      <p className="text-text-muted text-[13px] mb-8">
        Archived sessions. Unarchive to send a project back to All projects.
      </p>

      <ProjectsTable
        variant="archive"
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
            done: r.done,
            archived: true,
          };
        })}
      />
    </>
  );
}
