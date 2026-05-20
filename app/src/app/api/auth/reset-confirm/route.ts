import { NextResponse } from "next/server";
import { consumeResetToken, getUserById, updateUserPassword } from "@/lib/auth-store";
import { setSession } from "@/lib/session";

export async function POST(req: Request) {
  const { token, password } = (await req.json()) as {
    token?: string;
    password?: string;
  };
  if (!token || !password || password.length < 8) {
    return NextResponse.json(
      { error: "invalid_request", message: "Password must be at least 8 characters." },
      { status: 400 },
    );
  }

  const t = await consumeResetToken(token);
  if (!t) {
    return NextResponse.json(
      {
        error: "invalid_token",
        message: "This reset link is expired or has already been used. Request a new one.",
      },
      { status: 400 },
    );
  }

  await updateUserPassword(t.userId, password);

  const user = await getUserById(t.userId);
  if (user) setSession(user);
  return NextResponse.json({ ok: true });
}
