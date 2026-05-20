// Real sessions across every assigned studio, sorted by newest first.
// Replaces the legacy mockProjects list — admins + editors now see only
// what's actually in B2 under the studio path scheme.

import Link from "next/link";
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

export const dynamic = "force-dynamic";

function fmtBytes(n: number): string {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

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

      {rows.length === 0 ? (
        <div className="bg-bg-elev border border-border rounded-lg p-12 text-center">
          <p className="text-text-muted text-[13px]">
            No sessions in B2 yet.
          </p>
        </div>
      ) : (
        <div className="bg-bg-elev border border-border rounded-[16px] overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-text-muted text-[11px] uppercase tracking-wider border-b border-border">
                <th className="text-left p-4 font-medium">Session</th>
                <th className="text-left p-4 font-medium">Studio</th>
                <th className="text-left p-4 font-medium">Bucket</th>
                <th className="text-left p-4 font-medium">Client</th>
                <th className="text-left p-4 font-medium">Files</th>
                <th className="text-left p-4 font-medium">Size</th>
                <th className="text-left p-4 font-medium">Modified</th>
                <th className="text-right p-4 font-medium">Open</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const parsed = parseSessionFolder(r.folder);
                return (
                  <tr
                    key={`${r.studio}/${r.bucket}/${r.folder}`}
                    className="border-b border-border last:border-0 hover:bg-bg-elev-2"
                  >
                    <td className="p-4 font-medium">
                      {parsed ? `${parsed.date} ${parsed.time}` : r.folder}
                    </td>
                    <td className="p-4">{STUDIO_LABEL[r.studio]}</td>
                    <td className="p-4 text-text-muted">{BUCKET_LABEL[r.bucket]}</td>
                    <td className="p-4 text-text-muted">{r.clientEmail ?? "—"}</td>
                    <td className="p-4">{r.fileCount}</td>
                    <td className="p-4">{fmtBytes(r.sizeBytes)}</td>
                    <td className="p-4 text-text-muted">
                      {r.lastModified
                        ? new Date(r.lastModified).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="p-4 text-right">
                      <Link
                        href={`/admin/studios/${r.studio}/${r.bucket}/${encodeURIComponent(r.folder)}`}
                        className="px-3 py-1.5 rounded-[8px] bg-bg-elev-3 border border-border text-[12px]"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
