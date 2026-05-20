// Switch the active version pointer.

import { NextResponse } from "next/server";
import { decodeFileId } from "@/lib/b2";
import { requireEditorOrAdmin } from "@/lib/session";
import { canAccessKey } from "@/lib/access";
import { canonicalKey, setActive } from "@/lib/versions-store";

export const maxDuration = 30;

export async function POST(req: Request) {
  const user = requireEditorOrAdmin();
  const { sourceFileId, n } = (await req.json()) as {
    sourceFileId?: string;
    n?: number;
  };
  if (!sourceFileId || typeof n !== "number") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  let canonical: string;
  try {
    canonical = canonicalKey(decodeFileId(sourceFileId));
  } catch {
    return NextResponse.json({ error: "invalid_file_id" }, { status: 400 });
  }
  if (!canAccessKey(user, canonical)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const data = await setActive(canonical, n);
  if (!data) {
    return NextResponse.json({ error: "version_not_found" }, { status: 404 });
  }
  return NextResponse.json({ versions: data });
}
