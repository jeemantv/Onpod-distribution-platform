// Move a session folder (or a single file) between studio buckets.
// Editor and admin can move; admin-only is enforced for hard-delete elsewhere.
import { NextResponse } from "next/server";
import { requireEditorOrAdmin } from "@/lib/session";
import { movePrefix, moveFile } from "@/lib/b2";
import {
  BUCKETS,
  STUDIO_SLUGS,
  bucketPrefix,
  type Bucket,
  type StudioSlug,
} from "@/lib/studio";

export const maxDuration = 60;

interface MoveBody {
  fromStudio: StudioSlug;
  fromBucket: Bucket;
  toStudio: StudioSlug;
  toBucket: Bucket;
  folder: string;
  filename?: string;
}

function validateLocation(studio: string, bucket: string): boolean {
  return (
    STUDIO_SLUGS.includes(studio as StudioSlug) &&
    BUCKETS.includes(bucket as Bucket)
  );
}

export async function POST(req: Request) {
  requireEditorOrAdmin();
  const body = (await req.json()) as MoveBody;
  if (
    !validateLocation(body.fromStudio, body.fromBucket) ||
    !validateLocation(body.toStudio, body.toBucket)
  ) {
    return NextResponse.json({ error: "invalid_location" }, { status: 400 });
  }
  if (!body.folder) {
    return NextResponse.json({ error: "missing_folder" }, { status: 400 });
  }

  const fromBase = `${bucketPrefix(body.fromStudio, body.fromBucket)}${body.folder}/`;
  const toBase = `${bucketPrefix(body.toStudio, body.toBucket)}${body.folder}/`;

  if (body.filename) {
    await moveFile(`${fromBase}${body.filename}`, `${toBase}${body.filename}`);
    return NextResponse.json({ moved: 1 });
  }
  const moved = await movePrefix(fromBase, toBase);
  return NextResponse.json({ moved });
}
