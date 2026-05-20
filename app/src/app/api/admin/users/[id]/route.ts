// DELETE — admin removes a user from the B2 store. Mock users (sourced
// from mock-data.ts) can't be deleted via this endpoint, but they're
// already filtered server-side from the Team page where appropriate.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { deleteUser } from "@/lib/auth-store";

export const maxDuration = 30;

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const me = requireAdmin();
  if (me.id === params.id) {
    return NextResponse.json(
      { error: "cannot_delete_self", message: "You can't delete your own account." },
      { status: 400 },
    );
  }
  try {
    const ok = await deleteUser(params.id);
    if (!ok) {
      return NextResponse.json(
        { error: "not_found", message: "User not found or is a demo account." },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: "delete_failed", message: (err as Error).message },
      { status: 500 },
    );
  }
}
