import { notFound } from "next/navigation";
import {
  getAIContentForFile,
  getProjectById,
} from "@/lib/mock-data";
import { requireClient } from "@/lib/session";
import type { FileItem } from "@/lib/types";
import { LOCATION_LABEL } from "@/lib/types";
import { TopNav } from "@/components/TopNav";
import { FilePortal } from "./_components/FilePortal";
import {
  classifyByFilename,
  encodeFileId,
  guessMimeType,
  listFiles,
  projectPrefix,
} from "@/lib/b2";
import { AI_SUFFIX, TRANSCRIPT_SUFFIX } from "@/lib/transcript-store";
import { historyForUserGroupedByFile } from "@/lib/publish-history-store";
import { getFileMeta } from "@/lib/file-meta-store";
import { effectivePlan, getUserByEmail } from "@/lib/auth-store";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: { id: string } }) {
  const user = requireClient();
  const project = getProjectById(params.id);
  if (!project) notFound();
  if (project.userId !== user.id && user.role !== "admin") notFound();
  // Plan from DB (effectivePlan) so post-Stripe upgrades unlock buttons
  // immediately even if the session JWT is still on the trial/free plan.
  const storedClient = await getUserByEmail(user.email).catch(() => null);
  const livePlan = storedClient ? effectivePlan(storedClient) : user.plan;

  const b2Objects = await listFiles(projectPrefix(project.userId, project.id)).catch(
    (e) => {
      console.error("[b2 list]", e);
      return [];
    },
  );

  // Sidecar JSON files (.transcript.json, .ai.json) shouldn't appear as user files.
  const aiKeys = new Set(
    b2Objects.filter((o) => o.key.endsWith(AI_SUFFIX)).map((o) => o.key),
  );
  const transcriptKeys = new Set(
    b2Objects
      .filter((o) => o.key.endsWith(TRANSCRIPT_SUFFIX))
      .map((o) => o.key),
  );
  const videoObjects = b2Objects.filter(
    (o) =>
      !o.key.endsWith(AI_SUFFIX) &&
      !o.key.endsWith(TRANSCRIPT_SUFFIX) &&
      !o.key.endsWith("/.file-meta.json"),
  );

  const publishByFile = await historyForUserGroupedByFile(project.userId);
  const meta = await getFileMeta(project.userId, project.id);

  const files: FileItem[] = videoObjects.map((o) => {
    const name = o.key.split("/").slice(-1)[0] ?? "file";
    const override = meta[o.key];
    const publishStates = (publishByFile[o.key] ?? []).map((row) => ({
      platform: row.platform,
      action: row.action,
      vidType: row.vidType ?? undefined,
    }));
    return {
      id: encodeFileId(o.key),
      projectId: project.id,
      name,
      type: override?.type ?? classifyByFilename(name),
      mimeType: guessMimeType(name),
      sizeBytes: o.sizeBytes,
      backblazeKey: o.key,
      uploadedAt: (o.lastModified ?? new Date()).toISOString(),
      approvalStatus: override?.approvalStatus ?? "none",
      statusId: override?.statusId ?? null,
      publishStates,
      downloadCount: 0,
    };
  });

  const aiByFile: Record<string, boolean> = {};
  for (const f of files) {
    aiByFile[f.id] =
      aiKeys.has(f.backblazeKey + AI_SUFFIX) ||
      !!getAIContentForFile(f.id);
  }
  void transcriptKeys;

  const formattedDate = new Date(project.recordedAt).toLocaleDateString(
    "en-US",
    { month: "long", day: "numeric", year: "numeric" },
  );

  return (
    <>
      <TopNav user={user} backHref="/account" backLabel="All folders" />
      <main className="max-w-[1280px] mx-auto px-4 sm:px-8 py-6 sm:py-10 pb-32">
        <div className="mb-6 sm:mb-7">
          <h1 className="display text-[28px] sm:text-[42px] tracking-wide leading-tight">
            {LOCATION_LABEL[project.location].toUpperCase()} — {formattedDate}
          </h1>
          <div className="flex items-center gap-2 sm:gap-4 mt-2 text-[12px] sm:text-[13px] text-text-muted flex-wrap">
            <span>{files.length} files</span>
            <span>·</span>
            <span>{project.duration}</span>
            <span>·</span>
            <span>{project.cameraCount} cameras</span>
            <span className="sm:ml-auto inline-flex items-center gap-1.5 px-3 py-1 bg-[rgba(20,184,166,0.1)] text-accent-2 rounded-full text-[12px] font-medium">
              <span className="w-[6px] h-[6px] rounded-full bg-current" />
              {user.role === "admin" ? "Studio editor" : "Viewer · downloads enabled"}
            </span>
          </div>
        </div>

        <FilePortal
          projectId={project.id}
          files={files}
          aiReadyByFile={aiByFile}
          shareToken={project.shareToken}
          studioSlug={storedClient?.homeStudio ?? "_default"}
          userPlan={livePlan}
          userRole={user.role}
        />
      </main>
    </>
  );
}
