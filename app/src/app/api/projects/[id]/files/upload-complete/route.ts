import { NextResponse } from "next/server";

// TODO: spec §5.3 — insert into `files` table after the B2 upload succeeds.
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const { backblazeKey } = (await req.json()) as { backblazeKey: string };
  const name = backblazeKey.split("/").slice(-1)[0] ?? "file";
  return NextResponse.json({
    file: {
      id: `f_new_${Date.now()}`,
      projectId: params.id,
      name,
      type: "edited",
      mimeType: name.endsWith(".mp4") ? "video/mp4" : "application/octet-stream",
      sizeBytes: 0,
      backblazeKey,
      uploadedAt: new Date().toISOString(),
      approvalStatus: "none",
      publishStates: [],
      downloadCount: 0,
    },
  });
}
