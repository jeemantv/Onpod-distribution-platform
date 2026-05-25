import { NextResponse } from "next/server";
import { listSessionsInBucket } from "@/lib/studio-store";
import { BUCKETS, type Bucket, type StudioSlug } from "@/lib/studio";
import { assertStudioAccess } from "@/lib/editor-access";

export const maxDuration = 30;

export async function GET(
  _req: Request,
  { params }: { params: { studio: string; bucket: string } },
) {
  const blocked = await assertStudioAccess(params.studio);
  if (blocked) return blocked;
  if (!BUCKETS.includes(params.bucket as Bucket)) {
    return NextResponse.json({ error: "unknown_bucket" }, { status: 404 });
  }
  const sessions = await listSessionsInBucket(
    params.studio as StudioSlug,
    params.bucket as Bucket,
  );
  return NextResponse.json({ sessions });
}
