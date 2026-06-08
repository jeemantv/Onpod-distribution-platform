import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getBucket } from "@/lib/bucket-store";
import { postNextFromBucket } from "@/lib/bucket-runner";

// Manual test: immediately post the next clip in the rotation.
export const maxDuration = 120;

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const bucket = await getBucket(params.id);
  if (!bucket || bucket.userId !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const result = await postNextFromBucket(bucket);
  if (!result.posted) {
    return NextResponse.json({ error: "post_failed", message: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
