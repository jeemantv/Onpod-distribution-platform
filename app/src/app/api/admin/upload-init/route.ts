// Studio-aware multipart upload init. Used by admin/editor to drop files
// into studios/{studio}/{bucket}/{folder?}/{filename}.
import { NextResponse } from "next/server";
import { guessMimeType, startMultipartUpload } from "@/lib/b2";
import { requireEditorOrAdmin } from "@/lib/session";
import {
  BUCKETS,
  STUDIO_SLUGS,
  bucketPrefix,
  type Bucket,
  type StudioSlug,
} from "@/lib/studio";

export const maxDuration = 30;

interface InitBody {
  studio: StudioSlug;
  bucket: Bucket;
  folder?: string;
  filename: string;
  sizeBytes: number;
  mimeType?: string;
}

function sanitize(name: string): string {
  return name.replace(/[^\w.\-]/g, "_");
}

export async function POST(req: Request) {
  requireEditorOrAdmin();
  const body = (await req.json()) as InitBody;

  if (!STUDIO_SLUGS.includes(body.studio) || !BUCKETS.includes(body.bucket)) {
    return NextResponse.json({ error: "invalid_location" }, { status: 400 });
  }
  if (!body.filename || typeof body.sizeBytes !== "number" || body.sizeBytes <= 0) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const folder = body.folder ? `${body.folder}/` : "";
  const key = `${bucketPrefix(body.studio, body.bucket)}${folder}${sanitize(body.filename)}`;
  const contentType = body.mimeType || guessMimeType(body.filename);

  try {
    const init = await startMultipartUpload(key, contentType, body.sizeBytes);
    return NextResponse.json(init);
  } catch (err) {
    console.error("[admin/upload-init]", err);
    return NextResponse.json(
      { error: "b2_error", message: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
