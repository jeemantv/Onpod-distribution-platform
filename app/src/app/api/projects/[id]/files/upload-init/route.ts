import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

// TODO: spec §5.3 — generate a B2 pre-signed PUT URL for direct upload.
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { filename, sizeBytes, mimeType, targetFolder } =
    (await req.json()) as Record<string, string | number>;

  return NextResponse.json({
    uploadUrl: `https://b2-mock.example.com/upload/${params.id}/${filename}`,
    backblazeKey: `${params.id}/${targetFolder}/${filename}`,
    sizeBytes,
    mimeType,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
}
