// Hard-delete a session folder from the "to-delete" bucket. Admin-only.
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { deletePrefix } from "@/lib/b2";
import {
  BUCKETS,
  bucketPrefix,
  type Bucket,
  type StudioSlug,
} from "@/lib/studio";
import { assertStudioAccess } from "@/lib/editor-access";

export const maxDuration = 60;

interface DeleteBody {
  studio: StudioSlug;
  bucket: Bucket;
  folder: string;
}

export async function POST(req: Request) {
  // Admin-only — but scoped admins can only delete in their own studios.
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json(
      { error: "forbidden", message: "Admin only." },
      { status: 403 },
    );
  }
  const body = (await req.json()) as DeleteBody;
  const blocked = await assertStudioAccess(body.studio);
  if (blocked) return blocked;
  if (!BUCKETS.includes(body.bucket) || !body.folder) {
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
