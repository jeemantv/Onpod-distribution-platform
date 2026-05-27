// GET  /api/file-statuses?studio=<slug>  → list (any signed-in user)
// POST /api/file-statuses                → create (admin/editor)
//
// Editors are scoped: their assignedStudios array gates which studios
// they can manage. Clients can read but not write.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { loadEditorScope } from "@/lib/editor-access";
import {
  createStatus,
  listStatusesFor,
} from "@/lib/file-statuses-store";

async function canManage(
  user: { role: string; email: string },
  studio: string,
): Promise<boolean> {
  if (user.role !== "admin" && user.role !== "editor") return false;
  const scope = await loadEditorScope(user as Parameters<typeof loadEditorScope>[0]);
  // null studios = super-admin / unrestricted.
  if (scope.studios === null) return true;
  return scope.studios.includes(studio);
}

export async function GET(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const studio = new URL(req.url).searchParams.get("studio") || "_default";
  const list = await listStatusesFor(studio);
  return NextResponse.json({ studio, statuses: list });
}

export async function POST(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    studio?: string;
    label?: string;
    color?: string;
  };
  const studio = (body.studio ?? "_default").trim();
  const label = body.label?.trim();
  const color = body.color?.trim();
  if (!label || !color) {
    return NextResponse.json(
      { error: "missing_fields", message: "label and color are required" },
      { status: 400 },
    );
  }
  if (!(await canManage(user, studio))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const created = await createStatus({ studioSlug: studio, label, color });
  return NextResponse.json({ status: created });
}
