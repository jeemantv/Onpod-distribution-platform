// Revoke a studio invite. Soft-delete (sets revoked_at) so the token
// stays in the DB for click-tracking but stops accepting signups.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { loadEditorScope } from "@/lib/editor-access";
import { revokeStudioInvite } from "@/lib/studio-registry";

async function gate(studioSlug: string): Promise<NextResponse | null> {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json(
      { error: "forbidden", message: "Only admins can manage invites." },
      { status: 403 },
    );
  }
  const scope = await loadEditorScope(user);
  if (scope.studios !== null && !scope.studios.includes(studioSlug)) {
    return NextResponse.json(
      { error: "forbidden", message: "Not your studio." },
      { status: 403 },
    );
  }
  return null;
}

export async function DELETE(
  _req: Request,
  { params }: { params: { studio: string; inviteId: string } },
) {
  const block = await gate(params.studio);
  if (block) return block;
  await revokeStudioInvite(params.inviteId);
  return NextResponse.json({ ok: true });
}
