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
import { canonicalKey, isVersionedKey, resolveActive } from "@/lib/versions-store";
import { getUserByEmail } from "@/lib/auth-store";

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

  // Self-upload toggle lives on the user row — session payload doesn't
  // carry it (would force a re-login on every admin flip). One DB hit
  // per page render is acceptable.
  const stored = await getUserByEmail(user.email).catch(() => null);
  const selfUploadEnabled =
    user.role === "admin" ||
    (user.role as string) === "editor" ||
    !!stored?.selfUploadEnabled;

  const allObjects = await listSessionFiles(studio, "clients", folder);
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
      !isVersionedKey(o.key),
  );
  const syntheticProjectId = `studio:${studio}:clients:${folder}`;
  // Load file_meta overrides (approvalStatus + type override) the same
  // way the admin session page does — without this the client view
  // forgets approvals + clips-tab classifications on every page load.
  const { getFileMeta } = await import("@/lib/file-meta-store");
  const metaOverrides = await getFileMeta("studios", syntheticProjectId);
  // Bulk load YouTube / Spotify / OpusClip publish history for every
  // video file in this folder so each row can show "Published — …"
  // badges. Keys we care about are both the canonical and active
  // version's actual B2 key (publishes get logged against the active key).
  const { historyByFileKeys } = await import("@/lib/publish-history-store");
  const candidateKeys = visibleObjects
    .filter((o) => /\.(mp4|mov|webm)$/i.test(o.filename))
    .map((o) => o.key);
  // Also include resolved active keys so v2+ publishes show up.
  const activeKeysPromise = Promise.all(
    candidateKeys.map(async (k) => {
      const a = await resolveActive(canonicalKey(k)).catch(() => null);
      return a?.key;
    }),
  );
  const activeKeys = (await activeKeysPromise).filter(
    (k): k is string => typeof k === "string",
  );
  const publishByKey = await historyByFileKeys([
    ...new Set([...candidateKeys, ...activeKeys]),
  ]);
  const files: FileItem[] = await Promise.all(
    visibleObjects.map(async (o) => {
      const isVideo = /\.(mp4|mov|webm)$/i.test(o.filename);
      const canonical = canonicalKey(o.key);
      const active = isVideo ? await resolveActive(canonical) : null;
      const liveKey = active && active.n > 1 ? active.key : o.key;
      // When v2/v3+ is active, prefer the editor's original filename
      // (stored on the version row) so the title reflects the actual
      // file they uploaded. Fall back to the synthetic .vN basename for
      // legacy versions that pre-date displayFilename.
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

        <FilePortal
          projectId={syntheticProjectId}
          files={files}
          aiReadyByFile={aiByFile}
          shareToken=""
          studioContext={{ studio, bucket: "clients", folder }}
          currentUserEmail={user.email}
          canMarkDone={user.role === "admin" || (user.role as string) === "editor"}
          userPlan={user.plan}
          userRole={user.role}
          canUpload={selfUploadEnabled}
        />
      </main>
    </>
  );
}
