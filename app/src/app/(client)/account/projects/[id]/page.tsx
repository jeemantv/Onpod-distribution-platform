import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAIContentForFile,
  getFilesForProject,
  getProjectById,
} from "@/lib/mock-data";
import { requireClient } from "@/lib/session";
import { LOCATION_LABEL } from "@/lib/types";
import { TopNav } from "@/components/TopNav";
import { FilePortal } from "./_components/FilePortal";

export default function ProjectPage({ params }: { params: { id: string } }) {
  const user = requireClient();
  const project = getProjectById(params.id);
  if (!project) notFound();
  if (project.userId !== user.id && user.role !== "admin") notFound();

  const files = getFilesForProject(project.id);
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
