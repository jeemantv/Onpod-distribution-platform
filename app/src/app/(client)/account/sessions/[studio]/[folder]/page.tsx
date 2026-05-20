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
import {
  classifyByFilename,
  encodeFileId,
  guessMimeType,
} from "@/lib/b2";
import { AI_SUFFIX, TRANSCRIPT_SUFFIX } from "@/lib/transcript-store";
import type { FileItem } from "@/lib/types";
import { FilePortal } from "@/app/(client)/account/projects/[id]/_components/FilePortal";
import { VideoReviewer } from "@/components/VideoReviewer";
import { publicUrl } from "@/lib/b2-public";

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

  const allObjects = await listSessionFiles(studio, "clients", folder);
  const aiKeys = new Set(
    allObjects.filter((o) => o.key.endsWith(AI_SUFFIX)).map((o) => o.key),
  );
  const visibleObjects = allObjects.filter(
    (o) =>
      !o.key.endsWith(AI_SUFFIX) &&
      !o.key.endsWith(TRANSCRIPT_SUFFIX) &&
      !o.key.endsWith(".file-meta.json") &&
      !o.key.includes(".cover-") &&
      !o.key.includes(".bb-") &&
      !o.key.includes(".thumb-") &&
      !o.key.includes(".enhanced") &&
      !o.key.includes(".nobg-"),
  );
  const syntheticProjectId = `studio:${studio}:clients:${folder}`;
  const files: FileItem[] = visibleObjects.map((o) => ({
    id: encodeFileId(o.key),
    projectId: syntheticProjectId,
    name: o.filename,
    type: classifyByFilename(o.filename),
    mimeType: guessMimeType(o.filename),
    sizeBytes: o.sizeBytes,
    backblazeKey: o.key,
    uploadedAt: o.lastModified ?? new Date().toISOString(),
    approvalStatus: "none",
    publishStates: [],
    downloadCount: 0,
  }));
  const aiByFile: Record<string, boolean> = {};
  for (const f of files) {
    aiByFile[f.id] = aiKeys.has(f.backblazeKey + AI_SUFFIX);
  }

  return (
    <>
      <TopNav user={user} backHref="/account" backLabel="All sessions" />
      <main className="max-w-[1280px] mx-auto px-4 sm:px-8 py-6 sm:py-10 pb-32">
        <div className="mb-6 sm:mb-7">
          <h1 className="display text-[28px] sm:text-[42px] tracking-wide leading-tight">
            {STUDIO_LABEL[studio].toUpperCase()} —{" "}
            {parsed ? `${parsed.date} ${parsed.time}` : folder}
          </h1>
          <div className="flex items-center gap-2 sm:gap-4 mt-2 text-[12px] sm:text-[13px] text-text-muted flex-wrap">
            <span>{files.length} files</span>
            <span>·</span>
            <span>{STUDIO_LABEL[studio]} studio</span>
            <span className="sm:ml-auto inline-flex items-center gap-1.5 px-3 py-1 bg-[rgba(20,184,166,0.1)] text-accent-2 rounded-full text-[12px] font-medium">
              <span className="w-[6px] h-[6px] rounded-full bg-current" />
              Viewer · downloads enabled
            </span>
          </div>
          {parsed?.email ? (
            <p className="text-text-muted text-[12px] mt-1">{parsed.email}</p>
          ) : null}
          <p className="text-[12px] text-text-muted mt-3">
            <Link href="/account" className="underline hover:text-text">
              ← back to all sessions
            </Link>
          </p>
        </div>

        {/* One reviewer block per video file in the session */}
        {files
          .filter((f) => /\.(mp4|mov|webm)$/i.test(f.name))
          .map((f) => (
            <VideoReviewer
              key={f.id}
              fileId={f.id}
              fileUrl={publicUrl(f.backblazeKey)}
              fileLabel={f.name}
              canMarkDone={user.role === "admin" || (user.role as string) === "editor"}
              currentEmail={user.email}
            />
          ))}

        <FilePortal
          projectId={syntheticProjectId}
          files={files}
          aiReadyByFile={aiByFile}
          shareToken=""
          studioContext={{ studio, bucket: "clients", folder }}
        />
      </main>
    </>
  );
}
