import { NextResponse } from "next/server";
import { b2, bucket, decodeFileId } from "@/lib/b2";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { deleteFileMetaEntry } from "@/lib/file-meta-store";
import { getSession } from "@/lib/session";

export async function DELETE(
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

  const [ownerId, projectId] = key.split("/");
  if (user.role !== "admin" && ownerId !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    await b2.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    // Also clean sidecars
    for (const suffix of [".transcript.json", ".ai.json"]) {
      await b2
        .send(new DeleteObjectCommand({ Bucket: bucket, Key: key + suffix }))
        .catch(() => {});
    }
    await deleteFileMetaEntry(ownerId, projectId, key);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "b2_error", message: (err as Error).message },
      { status: 500 },
    );
  }
}
