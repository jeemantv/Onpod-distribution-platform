import { NextResponse } from "next/server";
import { decodeFileId } from "@/lib/b2";
import { setFileMetaEntry } from "@/lib/file-meta-store";
import { getSession } from "@/lib/session";
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

  const [ownerId, projectId] = key.split("/");
  if (user.role !== "admin" && ownerId !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as { type?: FileType; approvalStatus?: ApprovalStatus };
  if (body.type && !VALID_TYPES.includes(body.type)) {
    return NextResponse.json({ error: "invalid_type" }, { status: 400 });
  }
  if (body.approvalStatus && !VALID_APPROVAL.includes(body.approvalStatus)) {
    return NextResponse.json({ error: "invalid_approval" }, { status: 400 });
  }

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
