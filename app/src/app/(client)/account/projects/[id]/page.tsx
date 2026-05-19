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

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: { id: string } }) {
  const user = requireClient();
  const project = getProjectById(params.id);
  if (!project) notFound();
  if (project.userId !== user.id && user.role !== "admin") notFound();

  const b2Objects = await listFiles(projectPrefix(project.userId, project.id)).catch(
    (e) => {
      console.error("[b2 list]", e);
      return [];
    },
  );

  const files: FileItem[] = b2Objects.map((o) => {
    const name = o.key.split("/").slice(-1)[0] ?? "file";
    return {
      id: encodeFileId(o.key),
      projectId: project.id,
      name,
      type: classifyByFilename(name),
      mimeType: guessMimeType(name),
      sizeBytes: o.sizeBytes,
      backblazeKey: o.key,
      uploadedAt: (o.lastModified ?? new Date()).toISOString(),
      approvalStatus: "none",
      publishStates: [],
      downloadCount: 0,
    };
  });

  const aiByFile: Record<string, boolean> = {};
  for (const f of files) aiByFile[f.id] = !!getAIContentForFile(f.id);

  const formattedDate = new Date(project.recordedAt).toLocaleDateString(
    "en-US",
    { month: "long", day: "numeric", year: "numeric" },
  );

  return (
    <>
      <TopNav user={user} backHref="/account" backLabel="All folders" />
      <main className="max-w-[1280px] mx-auto px-8 py-10 pb-32">
        <div className="mb-7">
          <h1 className="display text-[42px] tracking-wide">
            {LOCATION_LABEL[project.location].toUpperCase()} — {formattedDate}
          </h1>
          <div className="flex items-center gap-4 mt-2 text-[13px] text-text-muted flex-wrap">
            <span>Updated {formattedDate}</span>
            <span>·</span>
            <span>{files.length} files</span>
            <span>·</span>
            <span>{project.duration}</span>
            <span>·</span>
            <span>{project.cameraCount} cameras</span>
            <span className="ml-auto inline-flex items-center gap-1.5 px-3 py-1 bg-[rgba(20,184,166,0.1)] text-accent-2 rounded-full text-[12px] font-medium">
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
        />
      </main>
    </>
  );
}
