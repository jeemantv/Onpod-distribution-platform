import Link from "next/link";
import { notFound } from "next/navigation";
import { requireEditorOrAdmin } from "@/lib/session";
import { listSessionsInBucket } from "@/lib/studio-store";
import {
  BUCKETS,
  BUCKET_LABEL,
  STUDIO_LABEL,
  STUDIO_SLUGS,
  type Bucket,
  type StudioSlug,
} from "@/lib/studio";
import { BucketActions } from "@/components/BucketActions";
import { NewSessionButton } from "@/components/NewSessionButton";

export const dynamic = "force-dynamic";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default async function BucketPage({
  params,
}: {
  params: { studio: string; bucket: string };
}) {
  const user = requireEditorOrAdmin();
  if (!STUDIO_SLUGS.includes(params.studio as StudioSlug)) notFound();
  if (!BUCKETS.includes(params.bucket as Bucket)) notFound();
  const studio = params.studio as StudioSlug;
  const bucket = params.bucket as Bucket;
  const { loadEditorScope, studioVisibleToEditor, sessionVisibleToEditor } =
    await import("@/lib/editor-access");
  const scope = await loadEditorScope(user);
  if (!studioVisibleToEditor(scope, studio)) notFound();
  const allSessions = await listSessionsInBucket(studio, bucket);
  const sessions = allSessions.filter((s) =>
    sessionVisibleToEditor(scope, studio, s.folder),
  );

  return (
    <>
      <div className="mb-2 text-[12px] text-text-muted">
        <Link href="/admin/studios" className="hover:text-text underline">
          Studios
        </Link>{" "}
        /{" "}
        <Link
          href={`/admin/studios/${studio}`}
          className="hover:text-text underline"
        >
          {STUDIO_LABEL[studio]}
        </Link>{" "}
        / <span className="text-text">{BUCKET_LABEL[bucket]}</span>
      </div>
      <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
        <div>
          <h1 className="display text-[32px] sm:text-[36px]">
            {STUDIO_LABEL[studio]} · {BUCKET_LABEL[bucket]}
          </h1>
          <p className="text-text-muted text-[13px] mt-1">
            {sessions.length} {sessions.length === 1 ? "session" : "sessions"} in this bucket.
          </p>
        </div>
        <NewSessionButton studio={studio} bucket={bucket} />
      </div>

      {sessions.length === 0 ? (
        <div className="bg-bg-elev border border-border rounded-lg p-12 text-center">
          <p className="text-text-muted">
            No sessions in this bucket yet.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {sessions.map((s) => (
            <li key={s.folder}>
              <div className="group flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 sm:py-4 bg-bg-elev border border-border rounded-lg hover:border-border-strong hover:bg-bg-elev-2 transition">
                <Link
                  href={`/admin/studios/${studio}/${bucket}/${encodeURIComponent(s.folder)}`}
                  className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0"
                >
                  <div className="w-10 h-10 rounded-md bg-bg-elev-3 flex items-center justify-center text-text-muted shrink-0">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[13px] sm:text-[14px] truncate">
                      {s.parsed ? `${s.parsed.date} ${s.parsed.time}` : s.folder}
                      {s.parsed?.email ? (
                        <span className="text-text-muted ml-2">— {s.parsed.email}</span>
                      ) : null}
                    </div>
                    <p className="text-[11px] sm:text-[12px] text-text-muted mt-1">
                      {s.fileCount} files · {formatBytes(s.sizeBytes)}
                      {s.lastModified ? (
                        <> · {new Date(s.lastModified).toLocaleDateString()}</>
                      ) : null}
                    </p>
                  </div>
                </Link>
                <div className="shrink-0">
                  <BucketActions
                    studio={studio}
                    bucket={bucket}
                    folder={s.folder}
                    isAdmin={user.role === "admin"}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
