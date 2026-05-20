import Link from "next/link";
import { notFound } from "next/navigation";
import { requireEditorOrAdmin } from "@/lib/session";
import { listSessionFiles } from "@/lib/studio-store";
import {
  BUCKETS,
  BUCKET_LABEL,
  STUDIO_LABEL,
  STUDIO_SLUGS,
  parseSessionFolder,
  type Bucket,
  type StudioSlug,
} from "@/lib/studio";
import { SessionFileList } from "@/components/SessionFileList";
import { SessionUploader } from "@/components/SessionUploader";
import { SessionAITools } from "@/components/SessionAITools";
import { encodeFileId } from "@/lib/b2";

export const dynamic = "force-dynamic";

export default async function SessionPage({
  params,
}: {
  params: { studio: string; bucket: string; folder: string };
}) {
  const user = requireEditorOrAdmin();
  if (!STUDIO_SLUGS.includes(params.studio as StudioSlug)) notFound();
  if (!BUCKETS.includes(params.bucket as Bucket)) notFound();
  const studio = params.studio as StudioSlug;
  const bucket = params.bucket as Bucket;
  const folder = decodeURIComponent(params.folder);
  const parsed = parseSessionFolder(folder);
  const files = await listSessionFiles(studio, bucket, folder);

  return (
    <>
      <div className="mb-2 text-[12px] text-text-muted">
        <Link href="/admin/studios" className="hover:text-text underline">
          Studios
        </Link>{" "}
        /{" "}
        <Link href={`/admin/studios/${studio}`} className="hover:text-text underline">
          {STUDIO_LABEL[studio]}
        </Link>{" "}
        /{" "}
        <Link
          href={`/admin/studios/${studio}/${bucket}`}
          className="hover:text-text underline"
        >
          {BUCKET_LABEL[bucket]}
        </Link>
      </div>

      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="display text-[28px]">
            {parsed ? `${parsed.date} ${parsed.time}` : folder}
          </h1>
          <p className="text-text-muted text-[13px] mt-1">
            {parsed ? parsed.email : "Unparseable folder name"} ·{" "}
            {files.length} files
          </p>
        </div>
      </div>

      <div className="mb-4">
        <SessionUploader studio={studio} bucket={bucket} folder={folder} />
      </div>

      <SessionAITools
        files={files.map((f) => ({
          key: f.key,
          filename: f.filename,
          fileId: encodeFileId(f.key),
        }))}
      />

      <SessionFileList
        studio={studio}
        bucket={bucket}
        folder={folder}
        files={files}
        canEdit={user.role === "admin" || user.role === "editor"}
        canDelete={user.role === "admin"}
      />
    </>
  );
}
