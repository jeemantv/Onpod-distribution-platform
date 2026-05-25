// Move a session folder (or a single file) between studio buckets.
// Editor and admin can move; admin-only is enforced for hard-delete elsewhere.
import { NextResponse } from "next/server";
import { movePrefix, moveFile } from "@/lib/b2";
import {
  BUCKETS,
  bucketPrefix,
  type Bucket,
  type StudioSlug,
} from "@/lib/studio";
import { assertStudioAccess } from "@/lib/editor-access";

export const maxDuration = 60;

interface MoveBody {
  fromStudio: StudioSlug;
  fromBucket: Bucket;
  toStudio: StudioSlug;
  toBucket: Bucket;
  folder: string;
  filename?: string;
}

export async function POST(req: Request) {
  const body = (await req.json()) as MoveBody;
  // Both source and destination studios must be (a) real and (b) in the
  // actor's scope. Bucket is a static enum, simple .includes is fine.
  if (!BUCKETS.includes(body.fromBucket) || !BUCKETS.includes(body.toBucket)) {
    return NextResponse.json({ error: "invalid_bucket" }, { status: 400 });
  }
  const blockFrom = await assertStudioAccess(body.fromStudio);
  if (blockFrom) return blockFrom;
  const blockTo = await assertStudioAccess(body.toStudio);
  if (blockTo) return blockTo;
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
