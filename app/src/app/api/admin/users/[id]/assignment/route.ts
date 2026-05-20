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
  const body = (await req.json()) as {
    assignedStudios?: string[];
    excludedClientEmails?: string[];
  };
  // Validate studios
  if (body.assignedStudios !== undefined) {
    const valid = body.assignedStudios.every(
      (s) => s === "all" || (STUDIO_SLUGS as readonly string[]).includes(s),
    );
    if (!valid) {
      return NextResponse.json({ error: "invalid_studio" }, { status: 400 });
    }
  }
  await updateEditorAssignment(params.id, body);
  return NextResponse.json({ ok: true });
}
