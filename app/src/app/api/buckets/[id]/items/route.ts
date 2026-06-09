import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { addItems, getBucket, removeItem } from "@/lib/bucket-store";
import { classifyByFilename } from "@/lib/b2";

async function ownBucket(id: string, userId: string) {
  const b = await getBucket(id);
  return b && b.userId === userId ? b : null;
}

// Add clips to a bucket. Body: { items: [{ fileKey, fileName }] }
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await ownBucket(params.id, user.id)))
    return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    items?: { fileKey: string; fileName: string }[];
  };
  // Buckets are clip-only — drop anything that classifies as a full episode
  // (edited) or source (raw) file.
  const items = (body.items ?? []).filter(
    (i) => i.fileKey && i.fileName && !["edited", "raw"].includes(classifyByFilename(i.fileName)),
  );
  if (items.length === 0) {
    return NextResponse.json(
      { error: "no_clips", message: "Only clips can be added to a bucket — not full episodes." },
      { status: 400 },
    );
  }
  const added = await addItems(params.id, items);
  return NextResponse.json({ ok: true, added });
}

// Remove one clip. Body: { itemId }
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await ownBucket(params.id, user.id)))
    return NextResponse.json({ error: "not_found" }, { status: 404 });

  const { itemId } = (await req.json().catch(() => ({}))) as { itemId?: string };
  if (!itemId) return NextResponse.json({ error: "missing_itemId" }, { status: 400 });
  await removeItem(params.id, itemId);
  return NextResponse.json({ ok: true });
}
