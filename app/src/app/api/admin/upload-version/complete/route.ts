// Finalize a new-version multipart upload and append it to the
// canonical file's versions.json sidecar (sets it as active).

import { NextResponse } from "next/server";
import { completeMultipartUpload, decodeFileId } from "@/lib/b2";
import { requireEditorOrAdmin } from "@/lib/session";
import { canAccessKey } from "@/lib/access";
import {
  appendVersion,
  canonicalKey,
  isVersionedKey,
} from "@/lib/versions-store";

export const maxDuration = 60;

interface Body {
  sourceFileId: string;
  key: string;
  uploadId: string;
  parts: { partNumber: number; etag: string }[];
  versionNumber: number;
  note?: string;
}

export async function POST(req: Request) {
  const user = requireEditorOrAdmin();
  const body = (await req.json()) as Body;
  if (
    !body.sourceFileId ||
    !body.key ||
    !body.uploadId ||
    !Array.isArray(body.parts) ||
    body.parts.length === 0 ||
    typeof body.versionNumber !== "number"
  ) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  // Defense in depth: the new key must be a versioned key under the
  // same canonical as the source.
  let canonical: string;
  try {
    canonical = canonicalKey(decodeFileId(body.sourceFileId));
  } catch {
    return NextResponse.json({ error: "invalid_file_id" }, { status: 400 });
  }
  if (!canAccessKey(user, canonical)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!isVersionedKey(body.key) || canonicalKey(body.key) !== canonical) {
    return NextResponse.json({ error: "key_mismatch" }, { status: 400 });
  }

  try {
    const result = await completeMultipartUpload(body.key, body.uploadId, body.parts);
    const data = await appendVersion(canonical, {
      n: body.versionNumber,
      key: body.key,
      uploadedAt: Date.now(),
      uploadedByEmail: user.email,
      uploadedByName: `${user.firstName} ${user.lastName}`.trim() || user.email,
      note: body.note?.trim() || undefined,
    });
    return NextResponse.json({
      key: result.key,
      sizeBytes: result.sizeBytes,
      versions: data,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "b2_error", message: (err as Error).message },
      { status: 500 },
    );
  }
}
