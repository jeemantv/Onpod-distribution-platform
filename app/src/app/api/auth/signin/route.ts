import { NextResponse } from "next/server";
import { signIn } from "@/lib/session";

// TODO: spec §4.1 — replace with Auth.js + Resend magic-link flow.
export async function POST(req: Request) {
  const { email } = (await req.json()) as { email?: string };
  if (!email) return NextResponse.json({ error: "missing email" }, { status: 400 });
  const user = signIn(email);
  return NextResponse.json({ user });
}
