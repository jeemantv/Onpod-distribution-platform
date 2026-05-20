import { NextResponse } from "next/server";
import { decodeFileId } from "@/lib/b2";
import { setFileMetaEntry } from "@/lib/file-meta-store";
import { getSession } from "@/lib/session";
import { canAccessKey } from "@/lib/access";
import { STUDIO_ROOT } from "@/lib/studio";
import type { ApprovalStatus, FileType } from "@/lib/types";

const VALID_TYPES: ReadonlyArray<FileType> = ["raw", "edited", "clip", "asset"];
const VALID_APPROVAL: ReadonlyArray<ApprovalStatus> = ["none", "pending", "approved", "rejected"];

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
  const [ownerId, projectId] = key.split("/");

  const body = (await req.json()) as { type?: FileType; approvalStatus?: ApprovalStatus };
  if (body.type && !VALID_TYPES.includes(body.type)) {
    return NextResponse.json({ error: "invalid_type" }, { status: 400 });
  }
  if (body.approvalStatus && !VALID_APPROVAL.includes(body.approvalStatus)) {
    return NextResponse.json({ error: "invalid_approval" }, { status: 400 });
  }

  // Studio paths: meta is keyed by the studio + bucket + folder path.
  // We piggy-back on the existing store using key.split("/")[0..1] which
  // for studio keys is "studios"/"{slug}" — that's stable so future
  // lookups by the same path collide cleanly.
  try {
    await setFileMetaEntry(ownerId, projectId, key, {
      type: body.type,
      approvalStatus: body.approvalStatus,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "b2_error", message: (err as Error).message },
      { status: 500 },
    );
  }
}
