import { NextResponse } from "next/server";
import { requireEditorOrAdmin } from "@/lib/session";
import { listAllUsers } from "@/lib/auth-store";

export const maxDuration = 30;

export async function GET() {
  requireEditorOrAdmin();
  const users = await listAllUsers();
  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
      avatar: u.avatar,
      avatarColor: u.avatarColor,
      createdAt: u.createdAt,
    })),
  });
}
