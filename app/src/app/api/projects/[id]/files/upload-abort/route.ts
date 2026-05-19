import { NextResponse } from "next/server";
import { abortMultipartUpload } from "@/lib/b2";
import { getProjectById } from "@/lib/mock-data";
import { getSession } from "@/lib/session";

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const project = getProjectById(params.id);
  if (!project) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (project.userId !== user.id && user.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { key, uploadId } = (await req.json()) as { key: string; uploadId: string };
  if (!key.startsWith(`${project.userId}/${project.id}/`)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    await abortMultipartUpload(key, uploadId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "b2_error", message: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
