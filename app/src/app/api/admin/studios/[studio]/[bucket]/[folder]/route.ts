import { NextResponse } from "next/server";
import { requireEditorOrAdmin } from "@/lib/session";
import { listSessionFiles } from "@/lib/studio-store";
import { BUCKETS, STUDIO_SLUGS, type Bucket, type StudioSlug } from "@/lib/studio";

export const maxDuration = 30;

export async function GET(
  _req: Request,
  {
    params,
  }: { params: { studio: string; bucket: string; folder: string } },
) {
  requireEditorOrAdmin();
  if (!STUDIO_SLUGS.includes(params.studio as StudioSlug)) {
    return NextResponse.json({ error: "unknown_studio" }, { status: 404 });
  }
  if (!BUCKETS.includes(params.bucket as Bucket)) {
    return NextResponse.json({ error: "unknown_bucket" }, { status: 404 });
  }
  const files = await listSessionFiles(
    params.studio as StudioSlug,
    params.bucket as Bucket,
    decodeURIComponent(params.folder),
  );
  return NextResponse.json({ files });
}
