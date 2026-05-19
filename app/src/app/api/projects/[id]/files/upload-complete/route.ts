import { NextResponse } from "next/server";
import { completeMultipartUpload, encodeFileId, classifyByFilename, guessMimeType } from "@/lib/b2";
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

  const { key, uploadId, parts } = (await req.json()) as {
    key: string;
    uploadId: string;
    parts: { partNumber: number; etag: string }[];
  };

  if (!key || !uploadId || !Array.isArray(parts) || parts.length === 0) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  if (!key.startsWith(`${project.userId}/${project.id}/`)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const result = await completeMultipartUpload(key, uploadId, parts);
    const name = key.split("/").slice(-1)[0] ?? "file";
    return NextResponse.json({
      file: {
        id: encodeFileId(result.key),
        projectId: project.id,
        name,
        type: classifyByFilename(name),
        mimeType: guessMimeType(name),
        sizeBytes: result.sizeBytes,
        backblazeKey: result.key,
        uploadedAt: new Date().toISOString(),
        approvalStatus: "none",
        publishStates: [],
        downloadCount: 0,
      },
    });
  } catch (err) {
    console.error("[upload-complete]", err);
    return NextResponse.json(
      { error: "b2_error", message: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
