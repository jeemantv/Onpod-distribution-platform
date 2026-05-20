import { NextResponse } from "next/server";
import { completeMultipartUpload } from "@/lib/b2";
import { requireEditorOrAdmin } from "@/lib/session";
import { STUDIO_ROOT } from "@/lib/studio";

export const maxDuration = 60;

export async function POST(req: Request) {
  requireEditorOrAdmin();
  const { key, uploadId, parts } = (await req.json()) as {
    key: string;
    uploadId: string;
    parts: { partNumber: number; etag: string }[];
  };
  if (!key || !uploadId || !Array.isArray(parts) || parts.length === 0) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (!key.startsWith(STUDIO_ROOT)) {
    return NextResponse.json({ error: "invalid_key" }, { status: 400 });
  }

  try {
    const result = await completeMultipartUpload(key, uploadId, parts);
    return NextResponse.json({ key: result.key, sizeBytes: result.sizeBytes });
  } catch (err) {
    console.error("[admin/upload-complete]", err);
    return NextResponse.json(
      { error: "b2_error", message: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
