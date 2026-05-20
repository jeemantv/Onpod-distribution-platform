// POST — point every client at this editor (sets assignedEditorEmail
// on every client account). Mock clients are auto-promoted into the
// B2 store so the change persists.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { assignEditorToAllClients, getUserById } from "@/lib/auth-store";
import { mockUsers } from "@/lib/mock-data";

export const maxDuration = 30;

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  requireAdmin();
  // Resolve the editor's email. Editor could be in B2 OR mock-data.
  let email: string | null = null;
  const stored = await getUserById(params.id);
  if (stored?.role === "editor") email = stored.email;
  if (!email) {
    const mock = mockUsers.find((u) => u.id === params.id && u.role === "editor");
    if (mock) email = mock.email;
  }
  if (!email) {
    return NextResponse.json({ error: "not_an_editor" }, { status: 400 });
  }
  try {
    const count = await assignEditorToAllClients(email);
    return NextResponse.json({ ok: true, count, email });
  } catch (err) {
    return NextResponse.json(
      { error: "assign_failed", message: (err as Error).message },
      { status: 500 },
    );
  }
}
