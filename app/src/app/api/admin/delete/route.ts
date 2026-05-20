// Hard-delete a session folder from the "to-delete" bucket. Admin-only.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { deletePrefix } from "@/lib/b2";
import {
  BUCKETS,
  STUDIO_SLUGS,
  bucketPrefix,
  type Bucket,
  type StudioSlug,
} from "@/lib/studio";

export const maxDuration = 60;

interface DeleteBody {
  studio: StudioSlug;
  bucket: Bucket;
  folder: string;
}

export async function POST(req: Request) {
  requireAdmin();
  const body = (await req.json()) as DeleteBody;
  if (
    !STUDIO_SLUGS.includes(body.studio) ||
    !BUCKETS.includes(body.bucket) ||
    !body.folder
  ) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (body.bucket !== "to-delete") {
    return NextResponse.json(
      {
        error: "wrong_bucket",
        message: "Move the session to the 'to-delete' bucket first.",
      },
      { status: 400 },
    );
  }
  const prefix = `${bucketPrefix(body.studio, body.bucket)}${body.folder}/`;
  const deleted = await deletePrefix(prefix);
  return NextResponse.json({ deleted });
}
