import { NextResponse } from "next/server";
import { getFilesForProject, getProjectById } from "@/lib/mock-data";
import { getSession } from "@/lib/session";

// TODO: spec §5.2 — return project + files grouped by type. Enforce ownership.
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const project = getProjectById(params.id);
  if (!project) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (project.userId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json({
    project,
    files: getFilesForProject(project.id),
  });
}
