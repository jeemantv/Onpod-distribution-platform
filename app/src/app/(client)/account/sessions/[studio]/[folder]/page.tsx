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
import { SessionAITools } from "@/components/SessionAITools";
import { AIMetadataPanel } from "@/components/AIMetadataPanel";
import { OpusClipPanel } from "@/components/OpusClipPanel";
import { BannerbearGenerator } from "@/components/BannerbearGenerator";
import { ThumbnailMaker } from "@/components/ThumbnailMaker";
import { PodcastPublish } from "@/components/PodcastPublish";
import { SessionFileList } from "@/components/SessionFileList";

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

        <SessionAITools files={rows} />
        <AIMetadataPanel files={rows} />
        <ThumbnailMaker
          files={rows}
          defaultSubtitle={parsed?.email ?? ""}
        />
        <BannerbearGenerator
          files={rows}
          defaultTitle={parsed ? `${parsed.date} session` : folder}
        />
        <OpusClipPanel files={rows} />
        <PodcastPublish files={rows} />

        <div className="mt-6">
          <h2 className="display text-[20px] text-text-muted mb-4">Files</h2>
          <SessionFileList
            studio={studio}
            bucket="clients"
            folder={folder}
            files={files}
            canEdit={false}
            canDelete={false}
          />
        </div>
      </main>
    </>
  );
}
