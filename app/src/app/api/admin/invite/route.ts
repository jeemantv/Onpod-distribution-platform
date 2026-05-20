import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import type { Plan } from "@/lib/types";

const VALID_PLANS: Plan[] = [
  "onpod_studio",
  "direct_base",
  "direct_double",
  "ext_studio_base",
  "ext_studio_double",
];

export async function POST(req: Request) {
  requireAdmin();
  const body = (await req.json()) as {
    email: string;
    firstName: string;
    lastName: string;
    plan: Plan;
  };
  if (!VALID_PLANS.includes(body.plan)) {
    return NextResponse.json({ error: "invalid_plan" }, { status: 400 });
  }
  return NextResponse.json({
    user: {
      id: `u_invited_${Date.now()}`,
      ...body,
      role: "client",
      createdAt: new Date().toISOString(),
    },
  });
}
