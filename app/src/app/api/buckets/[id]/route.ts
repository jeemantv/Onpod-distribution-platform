import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { deleteBucket, updateBucket } from "@/lib/bucket-store";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const patch = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  // Whitelist the editable fields.
  const allowed: (keyof typeof patch)[] = [
    "name",
    "channelId",
    "channelTitle",
    "visibility",
    "times",
    "days",
    "timezone",
    "titleTemplate",
    "active",
  ];
  const clean: Record<string, unknown> = {};
  for (const k of allowed) if (k in patch) clean[k] = patch[k];
  await updateBucket(params.id, user.id, clean);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await deleteBucket(params.id, user.id);
  return NextResponse.json({ ok: true });
}
