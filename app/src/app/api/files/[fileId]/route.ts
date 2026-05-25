import { NextResponse } from "next/server";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import {
  b2,
  bucket,
  decodeFileId,
  listFiles,
  moveFile,
} from "@/lib/b2";
import { deleteFileMetaEntry } from "@/lib/file-meta-store";
import { getSession } from "@/lib/session";
import { canAccessKey } from "@/lib/access";
import { STUDIO_ROOT, bucketPrefix, parseKey } from "@/lib/studio";

// Sidecars that travel with a file when it moves or gets deleted.
const SIDECAR_SUFFIXES = [
  ".transcript.json",
  ".ai.json",
  ".revisions.json",
  ".versions.json",
];

async function hardDelete(key: string): Promise<void> {
  await b2.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  for (const suffix of SIDECAR_SUFFIXES) {
    await b2
      .send(new DeleteObjectCommand({ Bucket: bucket, Key: key + suffix }))
      .catch(() => {});
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { fileId: string } },
) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let key: string;
  try {
    key = decodeFileId(params.fileId);
  } catch {
    return NextResponse.json({ error: "invalid_file_id" }, { status: 400 });
  }

  if (!canAccessKey(user, key)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Non-studio (legacy per-user) paths keep the original hard-delete
  // behaviour — there is no to-delete bucket out there.
  if (!key.startsWith(STUDIO_ROOT)) {
    if (user.role !== "admin") {
      return NextResponse.json({ error: "admin_only" }, { status: 403 });
    }
    const [ownerId, projectId] = key.split("/");
    try {
      await hardDelete(key);
      await deleteFileMetaEntry(ownerId, projectId, key);
      return NextResponse.json({ ok: true });
    } catch (err) {
      return NextResponse.json(
        { error: "b2_error", message: (err as Error).message },
        { status: 500 },
      );
    }
  }

  const parsed = parseKey(key);
  if (!parsed.studio || !parsed.bucket) {
    return NextResponse.json({ error: "bad_studio_key" }, { status: 400 });
  }

  // Already in to-delete? Only admins can hard-delete from here.
  if (parsed.bucket === "to-delete") {
    if (user.role !== "admin") {
      return NextResponse.json({ error: "admin_only" }, { status: 403 });
    }
    try {
      // Hard-delete the file, its sidecars, and every versioned sibling
      // sitting alongside it under the same prefix.
      const prefix = key.replace(/\.[^/.]+$/, ""); // strip extension
      const siblings = await listFiles(prefix);
      for (const s of siblings) {
        await b2
          .send(new DeleteObjectCommand({ Bucket: bucket, Key: s.key }))
          .catch(() => {});
      }
      await hardDelete(key);
      return NextResponse.json({ ok: true, mode: "hard" });
    } catch (err) {
      return NextResponse.json(
        { error: "b2_error", message: (err as Error).message },
        { status: 500 },
      );
    }
  }

  // Soft-delete: move file (+ sidecars + versioned siblings) into the
  // same studio's to-delete bucket, preserving the session folder so it
  // remains debuggable for the admin who cleans up later.
  const toBase = bucketPrefix(parsed.studio, "to-delete");
  // Drop the leading "studios/{studio}/{bucket}/" so the rest of the
  // path lands under the to-delete bucket unchanged.
  const fromBase = bucketPrefix(parsed.studio, parsed.bucket);
  if (!key.startsWith(fromBase)) {
    return NextResponse.json({ error: "bad_studio_key" }, { status: 400 });
  }
  const tail = key.slice(fromBase.length);
  const toKey = toBase + tail;

  try {
    await moveFile(key, toKey);
    for (const suffix of SIDECAR_SUFFIXES) {
      await moveFile(key + suffix, toKey + suffix).catch(() => {});
    }
    // Versioned siblings — find foo.v2.mp4 etc. under the same prefix.
    const prefix = key.replace(/\.[^/.]+$/, ".v");
    const siblings = await listFiles(prefix);
    for (const s of siblings) {
      if (s.key === key) continue;
      const sTail = s.key.slice(fromBase.length);
      await moveFile(s.key, toBase + sTail).catch(() => {});
    }
    return NextResponse.json({ ok: true, mode: "soft", to: toKey });
  } catch (err) {
    return NextResponse.json(
      { error: "b2_error", message: (err as Error).message },
      { status: 500 },
    );
  }
}
