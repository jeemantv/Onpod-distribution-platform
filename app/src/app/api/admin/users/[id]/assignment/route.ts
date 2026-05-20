// Admin-only: update an editor's studio assignment + per-client
// exclusions. Body: { assignedStudios?: string[], excludedClientEmails?: string[] }
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { updateEditorAssignment } from "@/lib/auth-store";
import { STUDIO_SLUGS } from "@/lib/studio";

export const maxDuration = 30;

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  requireAdmin();
  let body: {
    assignedStudios?: string[];
    excludedClientEmails?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (body.assignedStudios !== undefined) {
    const valid = body.assignedStudios.every(
      (s) => s === "all" || (STUDIO_SLUGS as readonly string[]).includes(s),
    );
    if (!valid) {
      return NextResponse.json({ error: "invalid_studio" }, { status: 400 });
    }
  }
  try {
    await updateEditorAssignment(params.id, body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "assignment_failed", message: (err as Error).message },
      { status: 500 },
    );
  }
}
