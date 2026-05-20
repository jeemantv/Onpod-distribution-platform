// GET — return the versions.json for a file (or null when there's none).

import { NextResponse } from "next/server";
import { decodeFileId, publicUrl } from "@/lib/b2";
import { requireSession } from "@/lib/session";
import { canAccessKey } from "@/lib/access";
import { canonicalKey, getVersions } from "@/lib/versions-store";

export const maxDuration = 15;

export async function GET(
  _req: Request,
  { params }: { params: { fileId: string } },
) {
  const user = requireSession();
  let key: string;
  try {
    key = decodeFileId(params.fileId);
  } catch {
    return NextResponse.json({ error: "invalid_file_id" }, { status: 400 });
  }
  if (!canAccessKey(user, key)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const canonical = canonicalKey(key);
  const data = await getVersions(canonical);
  if (!data) return NextResponse.json({ versions: null });
  const enriched = {
    ...data,
    versions: data.versions.map((v) => ({ ...v, url: publicUrl(v.key) })),
  };
  return NextResponse.json({ versions: enriched });
}
