import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { revokeDelegate } from "@/lib/delegates-store";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.guest) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const ok = await revokeDelegate(user.id, params.id);
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
