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
import {
  classifyByFilename,
  encodeFileId,
  guessMimeType,
  listFiles,
} from "@/lib/b2";
import { AI_SUFFIX, TRANSCRIPT_SUFFIX } from "@/lib/transcript-store";
import type { FileItem } from "@/lib/types";
import { FilePortal } from "@/app/(client)/account/projects/[id]/_components/FilePortal";
import {
  canonicalKey,
  isVersionedKey,
  resolveActive,
} from "@/lib/versions-store";

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

  const allObjects = await listSessionFiles(studio, bucket, folder);
  // Filter sidecars so they don't appear as user-visible files
  const aiKeys = new Set(
    allObjects.filter((o) => o.key.endsWith(AI_SUFFIX)).map((o) => o.key),
  );
  const visibleObjects = allObjects.filter(
    (o) =>
      !o.key.endsWith(AI_SUFFIX) &&
      !o.key.endsWith(TRANSCRIPT_SUFFIX) &&
      !o.key.endsWith(".file-meta.json") &&
      !o.key.endsWith(".versions.json") &&
      !o.key.endsWith(".revisions.json") &&
      !o.key.includes(".cover-") &&
      !o.key.includes(".bb-") &&
      !o.key.includes(".thumb-") &&
      !o.key.includes(".enhanced") &&
      !o.key.includes(".nobg-") &&
      // Hide versioned siblings (foo.v2.mp4) — the canonical row
      // resolves to the active version under the hood.
      !isVersionedKey(o.key),
  );

  const syntheticProjectId = `studio:${studio}:${bucket}:${folder}`;
  void listFiles;

  // Per-file overrides (folder type, approval status) live in the
  // file_meta table keyed by (ownerId="studios", projectId=synthetic).
  // Studio paths share that owner so this query pulls every override
  // for the current studio in one shot.
  const { getFileMeta } = await import("@/lib/file-meta-store");
  const metaOverrides = await getFileMeta("studios", syntheticProjectId);

  // Bulk-load publish history so each row gets the "Published — YouTube"
  // (etc.) badge without N+1 queries.
  const { historyByFileKeys } = await import("@/lib/publish-history-store");
  const videoKeys = visibleObjects
    .filter((o) => /\.(mp4|mov|webm)$/i.test(o.filename))
    .map((o) => o.key);
  const activeKeys = (
    await Promise.all(
      videoKeys.map(async (k) => {
        const a = await resolveActive(canonicalKey(k)).catch(() => null);
        return a?.key;
      }),
    )
  ).filter((k): k is string => typeof k === "string");
  const publishByKey = await historyByFileKeys([
    ...new Set([...videoKeys, ...activeKeys]),
  ]);

  const files: FileItem[] = await Promise.all(
    visibleObjects.map(async (o) => {
      // For video files, resolve the active version (which may be a
      // .vN sibling) so the row points at the latest edit.
      const isVideo = /\.(mp4|mov|webm)$/i.test(o.filename);
      const canonical = canonicalKey(o.key);
      const active = isVideo ? await resolveActive(canonical) : null;
      const liveKey = active && active.n > 1 ? active.key : o.key;
      const liveFilename =
        active && active.n > 1
          ? active.displayFilename ??
            active.key.split("/").pop() ??
            o.filename
          : o.filename;
      const override = metaOverrides[canonical] ?? metaOverrides[o.key];
      const publishRows = [
        ...(publishByKey[liveKey] ?? []),
        ...(liveKey !== o.key ? publishByKey[o.key] ?? [] : []),
      ];
      const publishStates = publishRows.map((row) => ({
        platform: row.platform,
        action: row.action,
        vidType: row.vidType ?? undefined,
      }));
      return {
        id: encodeFileId(canonical),
        projectId: syntheticProjectId,
        name: liveFilename,
        type: override?.type ?? classifyByFilename(o.filename),
        mimeType: guessMimeType(o.filename),
        sizeBytes: o.sizeBytes,
        backblazeKey: liveKey,
        uploadedAt: o.lastModified ?? new Date().toISOString(),
        approvalStatus: override?.approvalStatus ?? "none",
        statusId: override?.statusId ?? null,
        publishStates,
        downloadCount: 0,
      };
    }),
  );

  const aiByFile: Record<string, boolean> = {};
  for (const f of files) {
    aiByFile[f.id] = aiKeys.has(f.backblazeKey + AI_SUFFIX);
  }

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
        </Link>{" "}
        /{" "}
        <span className="text-text">
          {parsed ? `${parsed.date} ${parsed.time}` : folder}
        </span>
      </div>

      <div className="mb-6 sm:mb-7">
        <h1 className="display text-[28px] sm:text-[42px] tracking-wide leading-tight">
          {STUDIO_LABEL[studio].toUpperCase()} —{" "}
          {parsed ? `${parsed.date} ${parsed.time}` : folder}
        </h1>
        <div className="flex items-center gap-2 sm:gap-4 mt-2 text-[12px] sm:text-[13px] text-text-muted flex-wrap">
          <span>{files.length} files</span>
          <span>·</span>
          <span>{BUCKET_LABEL[bucket]}</span>
          {parsed?.email ? (
            <>
              <span>·</span>
              <span>{parsed.email}</span>
            </>
          ) : null}
          <span className="sm:ml-auto inline-flex items-center gap-1.5 px-3 py-1 bg-[rgba(20,184,166,0.1)] text-accent-2 rounded-full text-[12px] font-medium">
            <span className="w-[6px] h-[6px] rounded-full bg-current" />
            {user.role === "admin" ? "Admin" : "Editor"}
          </span>
        </div>
      </div>

      <FilePortal
        projectId={syntheticProjectId}
        files={files}
        aiReadyByFile={aiByFile}
        shareToken=""
        studioContext={{ studio, bucket, folder }}
        studioSlug={studio}
        currentUserEmail={user.email}
        canMarkDone={user.role === "admin" || user.role === "editor"}
        userPlan={user.plan}
        userRole={user.role}
        canUpload
      />
    </>
  );
}
