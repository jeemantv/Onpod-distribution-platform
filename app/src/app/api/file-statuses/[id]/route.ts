// PATCH /api/file-statuses/<id>  → rename / recolor / reorder / setDefault
// DELETE /api/file-statuses/<id> → archive (files using it fall back to default)

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { loadEditorScope } from "@/lib/editor-access";
import {
  archiveStatus,
  getStatusById,
  updateStatus,
} from "@/lib/file-statuses-store";

async function canManage(
  user: { role: string; email: string },
  studio: string,
): Promise<boolean> {
  if (user.role !== "admin" && user.role !== "editor") return false;
  const scope = await loadEditorScope(user as Parameters<typeof loadEditorScope>[0]);
  if (scope.studios === null) return true;
  return scope.studios.includes(studio);
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const target = await getStatusById(params.id);
  if (!target) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!(await canManage(user, target.studioSlug))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const patch = (await req.json().catch(() => ({}))) as {
    label?: string;
    color?: string;
    position?: number;
    isDefault?: boolean;
  };
  const updated = await updateStatus(params.id, patch);
  return NextResponse.json({ status: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const target = await getStatusById(params.id);
  if (!target) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!(await canManage(user, target.studioSlug))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  await archiveStatus(params.id);
  return NextResponse.json({ ok: true });
}
