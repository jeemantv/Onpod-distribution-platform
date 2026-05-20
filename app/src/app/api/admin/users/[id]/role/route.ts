import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { updateUserRole } from "@/lib/auth-store";

export const maxDuration = 30;

const ROLES = ["client", "editor", "admin"] as const;
type Role = (typeof ROLES)[number];

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  requireAdmin();
  const { role } = (await req.json()) as { role?: string };
  if (!role || !ROLES.includes(role as Role)) {
    return NextResponse.json({ error: "invalid_role" }, { status: 400 });
  }
  await updateUserRole(params.id, role as Role);
  return NextResponse.json({ ok: true });
}
