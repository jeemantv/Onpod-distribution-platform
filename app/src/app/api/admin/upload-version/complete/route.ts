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
import { setFileMetaEntry } from "@/lib/file-meta-store";
import { getRevisions, saveRevisions } from "@/lib/revisions-store";
import { STUDIO_ROOT, parseKey } from "@/lib/studio";

function metaKeysFor(key: string): { ownerId: string; projectId: string } | null {
  if (!key.startsWith(STUDIO_ROOT)) return null;
  const parsed = parseKey(key);
  if (!parsed.studio || !parsed.bucket || !parsed.sessionFolder) return null;
  return {
    ownerId: "studios",
    projectId: `studio:${parsed.studio}:${parsed.bucket}:${parsed.sessionFolder}`,
  };
}

export const maxDuration = 60;

interface Body {
  sourceFileId: string;
  key: string;
  uploadId: string;
  parts: { partNumber: number; etag: string }[];
  versionNumber: number;
  note?: string;
  // The filename the editor picked locally (e.g. "intro-recut.mp4").
  // We display this instead of the synthetic .vN suffix derived from
  // the canonical key, so the row title matches the actual file.
  displayFilename?: string;
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
      displayFilename: body.displayFilename?.trim() || undefined,
    });

    // Reset the loop: file flips to "Ready for approval" (approvalStatus
    // pending), and we clear the previous reviewSentAt so the "In revision"
    // signal evaporates. The note history itself is kept — the editor can
    // see what was requested even after marking them done.
    const meta = metaKeysFor(canonical);
    if (meta) {
      await setFileMetaEntry(meta.ownerId, meta.projectId, canonical, {
        approvalStatus: "pending",
      }).catch((err) => console.warn("[upload-version/complete] meta flip failed", err));
    }
    const existing = await getRevisions(canonical).catch(() => null);
    if (existing && existing.reviewSentAt) {
      await saveRevisions(canonical, {
        ...existing,
        status: "open",
        reviewSentAt: undefined,
      }).catch((err) => console.warn("[upload-version/complete] revisions reset failed", err));
    }

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
