// POST /api/admin/sessions/state — mark a B2 session ("project") done or
// archived. Editor/admin only; editors are scoped to their assigned
// studios. Body: { studio, bucket, folder, done?, archived? }. `done`
// and `archived` are independent — send either or both.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { loadEditorScope } from "@/lib/editor-access";
import { setSessionArchived, setSessionDone } from "@/lib/session-state-store";
import { BUCKETS, STUDIO_SLUGS, type Bucket, type StudioSlug } from "@/lib/studio";

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

export async function POST(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    studio?: string;
    bucket?: string;
    folder?: string;
    done?: boolean;
    archived?: boolean;
  };
  const studio = (body.studio ?? "").trim();
  const bucket = (body.bucket ?? "").trim();
  const folder = (body.folder ?? "").trim();

  if (!STUDIO_SLUGS.includes(studio as StudioSlug)) {
    return NextResponse.json({ error: "bad_studio" }, { status: 400 });
  }
  if (!BUCKETS.includes(bucket as Bucket)) {
    return NextResponse.json({ error: "bad_bucket" }, { status: 400 });
  }
  if (!folder) {
    return NextResponse.json({ error: "missing_folder" }, { status: 400 });
  }
  if (typeof body.done !== "boolean" && typeof body.archived !== "boolean") {
    return NextResponse.json({ error: "nothing_to_set" }, { status: 400 });
  }
  if (!(await canManage(user, studio))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let state;
  if (typeof body.done === "boolean") {
    state = await setSessionDone(studio, bucket, folder, body.done, user.email);
  }
  if (typeof body.archived === "boolean") {
    state = await setSessionArchived(studio, bucket, folder, body.archived, user.email);
  }
  return NextResponse.json({ state });
}
