// Admin-only: set or clear the editor assigned to a client.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { updateUserAssignedEditor } from "@/lib/auth-store";

export const maxDuration = 30;

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  requireAdmin();
  const { assignedEditorEmail } = (await req.json()) as {
    assignedEditorEmail?: string | null;
  };
  await updateUserAssignedEditor(
    params.id,
    assignedEditorEmail?.trim().toLowerCase() || null,
  );
  return NextResponse.json({ ok: true });
}
