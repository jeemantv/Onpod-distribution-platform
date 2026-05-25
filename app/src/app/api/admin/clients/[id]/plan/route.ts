// Admin (or editor) updates a client's plan. No Stripe wiring yet —
// this is the manual "I'll assign them to a paid tier" path. Stripe
// Checkout in a future step will hit this same updater via webhook.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { updateUserPlan, getUserById } from "@/lib/auth-store";
import { PLAN_LIMITS, type Plan } from "@/lib/types";
import { assertClientAccess } from "@/lib/editor-access";

const VALID_PLANS: Plan[] = [
  "free",
  "onpod_studio",
  "direct_base",
  "direct_double",
  "ext_studio_base",
  "ext_studio_double",
  "unlimited",
];

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const user = getSession();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json(
      { error: "forbidden", message: "Only admins can change plans." },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => null)) as { plan?: string } | null;
  const plan = body?.plan;
  if (!plan || !VALID_PLANS.includes(plan as Plan)) {
    return NextResponse.json(
      { error: "invalid_plan", message: `plan must be one of: ${VALID_PLANS.join(", ")}` },
      { status: 400 },
    );
  }

  // Scoped admin can only modify their own clients' plans.
  const target = await getUserById(params.id);
  if (!target) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const blocked = await assertClientAccess({
    clientEmail: target.email,
    clientHomeStudio: target.homeStudio ?? null,
  });
  if (blocked) return blocked;

  try {
    await updateUserPlan(params.id, plan);
    return NextResponse.json({
      ok: true,
      plan,
      label: PLAN_LIMITS[plan as Plan].label,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "update_failed", message: (err as Error).message },
      { status: 500 },
    );
  }
}
