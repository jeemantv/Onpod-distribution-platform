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
  const sessions = await listSessionsInBucket(studio, bucket);

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
        <h1 className="display text-[32px]">
          {STUDIO_LABEL[studio]} · {BUCKET_LABEL[bucket]}
        </h1>
        <NewSessionButton studio={studio} bucket={bucket} />
      </div>

      {sessions.length === 0 ? (
        <p className="text-text-muted text-[13px]">No sessions in this bucket yet.</p>
      ) : (
        <div className="bg-bg-elev border border-border rounded-[16px] overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-text-muted text-[11px] uppercase tracking-wider border-b border-border">
                <th className="text-left p-4 font-medium">Session</th>
                <th className="text-left p-4 font-medium">Email</th>
                <th className="text-left p-4 font-medium">Files</th>
                <th className="text-left p-4 font-medium">Size</th>
                <th className="text-left p-4 font-medium">Last modified</th>
                <th className="text-right p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr
                  key={s.folder}
                  className="border-b border-border last:border-0 hover:bg-bg-elev-2"
                >
                  <td className="p-4">
                    <Link
                      href={`/admin/studios/${studio}/${bucket}/${encodeURIComponent(s.folder)}`}
                      className="font-medium hover:underline"
                    >
                      {s.parsed ? `${s.parsed.date} ${s.parsed.time}` : s.folder}
                    </Link>
                  </td>
                  <td className="p-4 text-text-muted">
                    {s.parsed?.email ?? "—"}
                  </td>
                  <td className="p-4">{s.fileCount}</td>
                  <td className="p-4">{formatBytes(s.sizeBytes)}</td>
                  <td className="p-4 text-text-muted">
                    {s.lastModified
                      ? new Date(s.lastModified).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="p-4 text-right">
                    <BucketActions
                      studio={studio}
                      bucket={bucket}
                      folder={s.folder}
                      isAdmin={user.role === "admin"}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
