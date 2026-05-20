import { NextResponse } from "next/server";
import { createUser } from "@/lib/auth-store";
import { setSession } from "@/lib/session";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    email?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
  };
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";
  const firstName = body.firstName?.trim() || "";
  const lastName = body.lastName?.trim() || "";

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "weak_password", message: "Password must be at least 8 characters." },
      { status: 400 },
    );
  }
  if (!firstName || !lastName) {
    return NextResponse.json(
      { error: "missing_name", message: "Please enter your first and last name." },
      { status: 400 },
    );
  }

  try {
    const user = await createUser({
      email,
      password,
      firstName,
      lastName,
      role: "client",
    });
    setSession(user);
    return NextResponse.json({
      user: { id: user.id, email: user.email, role: user.role },
    });
  } catch (err) {
    const msg = (err as Error).message;
    return NextResponse.json(
      { error: "signup_failed", message: msg },
      { status: 400 },
    );
  }
}
