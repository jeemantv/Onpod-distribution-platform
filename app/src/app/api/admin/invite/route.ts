import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";

// TODO: spec §12.2 — create user row, generate first-time magic link, send welcome email.
export async function POST(req: Request) {
  requireAdmin();
  const body = (await req.json()) as {
    email: string;
    firstName: string;
    lastName: string;
    plan: "starter" | "pro" | "authority";
  };
  return NextResponse.json({
    user: {
      id: `u_invited_${Date.now()}`,
      ...body,
      role: "client",
      createdAt: new Date().toISOString(),
    },
  });
}
