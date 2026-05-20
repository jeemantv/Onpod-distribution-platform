import Link from "next/link";
import { notFound } from "next/navigation";
import { TopNav } from "@/components/TopNav";
import { requireClient } from "@/lib/session";
import { listSessionFiles } from "@/lib/studio-store";
import {
  STUDIO_LABEL,
  STUDIO_SLUGS,
  parseSessionFolder,
  sessionBelongsToEmail,
  type StudioSlug,
} from "@/lib/studio";
import { encodeFileId } from "@/lib/b2";
import { SessionVideoList } from "@/components/SessionVideoList";

export const dynamic = "force-dynamic";

export default async function ClientSessionPage({
  params,
}: {
  params: { studio: string; folder: string };
}) {
  const user = requireClient();
  if (!STUDIO_SLUGS.includes(params.studio as StudioSlug)) notFound();
  const studio = params.studio as StudioSlug;
  const folder = decodeURIComponent(params.folder);

  if (!sessionBelongsToEmail(folder, user.email) && user.role !== "admin") {
    notFound();
  }
  const parsed = parseSessionFolder(folder);
  const files = await listSessionFiles(studio, "clients", folder);

  const rows = files.map((f) => ({
    key: f.key,
    filename: f.filename,
    fileId: encodeFileId(f.key),
    url: f.url,
    sizeBytes: f.sizeBytes,
    lastModified: f.lastModified,
  }));

  return (
    <>
      <TopNav user={user} />
      <main className="max-w-[1280px] mx-auto px-4 sm:px-8 py-6 sm:py-10">
        <div className="mb-2 text-[12px] text-text-muted">
          <Link href="/account" className="hover:text-text underline">
            Your sessions
          </Link>{" "}
          /{" "}
          <span className="text-text">
            {parsed ? `${parsed.date} ${parsed.time}` : folder}
          </span>
        </div>
        <h1 className="display text-[28px] sm:text-[32px] mb-1">
          {parsed ? `${parsed.date} ${parsed.time}` : folder}
        </h1>
        <p className="text-text-muted text-[13px] mb-6">
          {STUDIO_LABEL[studio]} studio · {files.length} files
        </p>

        <SessionVideoList
          studio={studio}
          bucket="clients"
          folder={folder}
          files={rows}
          defaultTitle={parsed ? `${parsed.date} session` : folder}
          defaultSubtitle={parsed?.email ?? ""}
          canEdit={false}
          canDelete={false}
        />
      </main>
    </>
  );
}
