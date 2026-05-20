// Init multipart upload for a NEW VERSION of an existing video file.
// The new key is {basename}.v{N}.{ext}; the canonical v1 file stays put.

import { NextResponse } from "next/server";
import { decodeFileId, guessMimeType, startMultipartUpload } from "@/lib/b2";
import { requireEditorOrAdmin } from "@/lib/session";
import { canAccessKey } from "@/lib/access";
import {
  buildVersionedKey,
  canonicalKey,
  nextVersionNumber,
} from "@/lib/versions-store";

export const maxDuration = 30;

interface Body {
  sourceFileId: string;
  filename: string;
  sizeBytes: number;
  mimeType?: string;
}

export async function POST(req: Request) {
  const user = requireEditorOrAdmin();
  const body = (await req.json()) as Body;
  if (!body.sourceFileId || typeof body.sizeBytes !== "number" || body.sizeBytes <= 0) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  let canonical: string;
  try {
    canonical = canonicalKey(decodeFileId(body.sourceFileId));
  } catch {
    return NextResponse.json({ error: "invalid_file_id" }, { status: 400 });
  }
  if (!canAccessKey(user, canonical)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const n = await nextVersionNumber(canonical);
  const newKey = buildVersionedKey(canonical, n);
  const contentType = body.mimeType || guessMimeType(body.filename);

  try {
    const init = await startMultipartUpload(newKey, contentType, body.sizeBytes);
    return NextResponse.json({ ...init, versionNumber: n });
  } catch (err) {
    return NextResponse.json(
      { error: "b2_error", message: (err as Error).message },
      { status: 500 },
    );
  }
}
