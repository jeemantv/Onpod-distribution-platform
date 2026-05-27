import { NextResponse } from "next/server";
import { decodeFileId } from "@/lib/b2";
import { setFileMetaEntry } from "@/lib/file-meta-store";
import { getSession } from "@/lib/session";
import { canAccessKey } from "@/lib/access";
import { STUDIO_ROOT, parseKey } from "@/lib/studio";
import type { ApprovalStatus, FileType } from "@/lib/types";

const VALID_TYPES: ReadonlyArray<FileType> = ["raw", "edited", "clip", "asset"];
const VALID_APPROVAL: ReadonlyArray<ApprovalStatus> = ["none", "pending", "approved", "rejected"];

// Resolve the (ownerId, projectId) tuple that file_meta uses for a given
// B2 key. Studio paths share the synthetic owner "studios" and a
// project id that matches what the admin session page builds, so the
// editor's writes and the admin/client reads collide on the same row.
function metaKeysFor(key: string): { ownerId: string; projectId: string } {
  if (key.startsWith(STUDIO_ROOT)) {
    const parsed = parseKey(key);
    if (parsed.studio && parsed.bucket && parsed.sessionFolder) {
      return {
        ownerId: "studios",
        projectId: `studio:${parsed.studio}:${parsed.bucket}:${parsed.sessionFolder}`,
      };
    }
    return { ownerId: "studios", projectId: parsed.studio ?? "unknown" };
  }
  const [ownerId = "_", projectId = "_"] = key.split("/");
  return { ownerId, projectId };
}

export async function POST(
  req: Request,
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

  const body = (await req.json()) as {
    type?: FileType;
    approvalStatus?: ApprovalStatus;
    // `null` clears the status (fall back to studio default). `undefined`
    // means "don't touch this field."
    statusId?: string | null;
  };
  if (body.type && !VALID_TYPES.includes(body.type)) {
    return NextResponse.json({ error: "invalid_type" }, { status: 400 });
  }
  if (body.approvalStatus && !VALID_APPROVAL.includes(body.approvalStatus)) {
    return NextResponse.json({ error: "invalid_approval" }, { status: 400 });
  }

  const { ownerId, projectId } = metaKeysFor(key);

  try {
    await setFileMetaEntry(ownerId, projectId, key, {
      type: body.type,
      approvalStatus: body.approvalStatus,
      statusId: body.statusId,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "db_error", message: (err as Error).message },
      { status: 500 },
    );
  }
}
