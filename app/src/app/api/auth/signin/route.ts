import { NextResponse } from "next/server";
import { getUserByEmail, verifyPassword } from "@/lib/auth-store";
import { setSession, signInDemo } from "@/lib/session";
import { mockUsers } from "@/lib/mock-data";

const DEMO_PASSWORD = "demo";

export async function POST(req: Request) {
  const { email, password } = (await req.json()) as {
    email?: string;
    password?: string;
  };
  if (!email) {
    return NextResponse.json({ error: "missing_email" }, { status: 400 });
  }

  // Real B2 user → verify password
  const real = await getUserByEmail(email);
  if (real) {
    if (!password) {
      return NextResponse.json({ error: "missing_password" }, { status: 400 });
    }
    const ok = await verifyPassword(password, real.passwordHash);
    if (!ok) {
      return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
    }
    setSession(real);
    return NextResponse.json({
      user: { id: real.id, email: real.email, role: real.role },
    });
  }

  // Demo accounts (mock-data) — accept the literal "demo" password
  const demoUser = mockUsers.find(
    (u) => u.email.toLowerCase() === email.toLowerCase(),
  );
  if (demoUser) {
    if (password && password !== DEMO_PASSWORD) {
      return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
    }
    const u = signInDemo(email);
    if (!u) return NextResponse.json({ error: "demo_failed" }, { status: 500 });
    return NextResponse.json({
      user: { id: u.id, email: u.email, role: u.role },
    });
  }

  return NextResponse.json(
    { error: "not_found", message: "No account with that email." },
    { status: 404 },
  );
}
