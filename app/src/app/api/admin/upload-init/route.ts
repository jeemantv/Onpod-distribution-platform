// Studio-aware multipart upload init. Used by admin/editor to drop files
// into studios/{studio}/{bucket}/{folder?}/{filename}.
import { NextResponse } from "next/server";
import { guessMimeType, startMultipartUpload } from "@/lib/b2";
import { getSession } from "@/lib/session";
import { getUserByEmail } from "@/lib/auth-store";
import {
  BUCKETS,
  bucketPrefix,
  sessionBelongsToEmail,
  type Bucket,
  type StudioSlug,
} from "@/lib/studio";
import { isKnownStudio } from "@/lib/studio-registry";
import { assertStudioAccess } from "@/lib/editor-access";

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
  // Auth: admin/editor unconditionally; clients only if self-upload is
  // enabled AND they're uploading to a folder that belongs to them.
  const user = getSession();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as InitBody;

  if (!BUCKETS.includes(body.bucket)) {
    return NextResponse.json({ error: "invalid_location" }, { status: 400 });
  }

  if (user.role === "admin" || (user.role as string) === "editor") {
    // Admin/editor path: studio must exist + actor must have scope for it.
    const blocked = await assertStudioAccess(body.studio);
    if (blocked) return blocked;
  } else {
    // Client path: studio must exist (registry check), self-upload
    // enabled, folder must belong to them.
    if (!(await isKnownStudio(body.studio))) {
      return NextResponse.json({ error: "invalid_studio" }, { status: 400 });
    }
    const stored = await getUserByEmail(user.email).catch(() => null);
    if (!stored?.selfUploadEnabled) {
      return NextResponse.json(
        { error: "forbidden", message: "Self-upload isn't enabled for your account." },
        { status: 403 },
      );
    }
    if (!body.folder || !sessionBelongsToEmail(body.folder, user.email)) {
      return NextResponse.json(
        { error: "forbidden", message: "You can only upload to your own session folder." },
        { status: 403 },
      );
    }
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
