import { NextResponse } from "next/server";
import { decodeFileId, getDownloadUrl } from "@/lib/b2";
import { getSession } from "@/lib/session";
import { canAccessKey } from "@/lib/access";
import { canonicalKey, resolveActive } from "@/lib/versions-store";

export async function POST(
  _req: Request,
  { params }: { params: { fileId: string } },
) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let key: string;
  try {
    key = decodeFileId(params.fileId);
  } catch {
    return NextResponse.json({ error: "invalid_file_id" }, { status: 400 });
  }

  if (!canAccessKey(user, key)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // The file id is stable on the canonical (v1) key. If a later version
  // is currently marked active, sign that one instead — otherwise the
  // preview never switches when staff toggle versions in VersionMenu.
  let targetKey = key;
  if (/\.(mp4|mov|webm)$/i.test(key)) {
    try {
      const active = await resolveActive(canonicalKey(key));
      if (active.n > 1 && active.key) targetKey = active.key;
    } catch (err) {
      console.warn("[download] resolveActive failed, falling back to canonical", err);
    }
  }

  try {
    const signedUrl = await getDownloadUrl(targetKey, 900);
    return NextResponse.json({
      signedUrl,
      key: targetKey,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });
  } catch (err) {
    console.error("[download]", err);
    return NextResponse.json(
      { error: "b2_error", message: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
