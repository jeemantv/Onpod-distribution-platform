// Admin invite a new team member (editor or admin) by creating the
// user account directly. A welcome email + reset link are not sent
// here — the admin can pass the temporary password to them, or trigger
// /api/auth/reset-request afterwards.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { createUser, type StoredRole } from "@/lib/auth-store";

export const maxDuration = 30;

const VALID_ROLES: StoredRole[] = ["editor", "admin", "client"];

export async function POST(req: Request) {
  requireAdmin();
  const body = (await req.json()) as {
    email?: string;
    firstName?: string;
    lastName?: string;
    role?: string;
    temporaryPassword?: string;
  };
  const email = body.email?.trim().toLowerCase();
  const firstName = body.firstName?.trim();
  const lastName = body.lastName?.trim();
  const role = body.role as StoredRole | undefined;
  const password = body.temporaryPassword;

  if (!email || !firstName || !lastName || !role || !password) {
    return NextResponse.json(
      { error: "missing_fields" },
      { status: 400 },
    );
  }
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "invalid_role" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "weak_password", message: "Password must be at least 8 characters." },
      { status: 400 },
    );
  }

  try {
    const user = await createUser({
      email,
      password,
      firstName,
      lastName,
      role,
    });
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "invite_failed", message: (err as Error).message },
      { status: 400 },
    );
  }
}
