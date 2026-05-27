// Server-side helper — converts a `userCanUse` failure into a 402 JSON
// response so each gated route can early-return without ceremony.

import { NextResponse } from "next/server";
import { PLAN_LIMITS, type Plan } from "./types";
import { userCanUse, type GatedFeature } from "./plan-gate";
import { effectivePlan, getUserByEmail } from "./auth-store";

interface PlanCarrier {
  plan?: Plan | string;
  role?: string;
  email?: string;
}

/**
 * Async gate that re-reads the user's current plan from the DB. The
 * session cookie's plan field can be stale after an admin manually
 * changes a client's plan (or after a Stripe webhook flips it). Always
 * trusting the DB row at request time is one extra query but means
 * admin actions take effect immediately without re-login.
 */
export async function gate(
  user: PlanCarrier,
  feature: GatedFeature,
): Promise<NextResponse | null> {
  // Admin / editor bypass — userCanUse already handles this.
  if (userCanUse(user, feature)) return null;
  // Re-check against fresh DB plan in case the session is stale.
  // effectivePlan() also downgrades to "free" when a trial has expired
  // and no Stripe sub backs the stored plan — so trial users can't keep
  // unlimited features after day 7.
  if (user.email) {
    const stored = await getUserByEmail(user.email).catch(() => null);
    if (stored) {
      const live = effectivePlan(stored);
      if (userCanUse({ ...user, plan: live }, feature)) return null;
    }
  }
  const planKey = user.plan ?? "free";
  const label = (PLAN_LIMITS as Record<string, { label: string }>)[planKey]?.label ?? planKey;
  return NextResponse.json(
    {
      error: "plan_gated",
      feature,
      plan: planKey,
      planLabel: label,
      message: `Your plan ("${label}") doesn't include ${humanFeature(feature)}. Ask an admin to assign a paid plan.`,
    },
    { status: 402 },
  );
}

function humanFeature(f: GatedFeature): string {
  switch (f) {
    case "ai": return "AI metadata + transcription";
    case "clips": return "short-form clip generation";
    case "youtube": return "YouTube publishing";
    case "spotify": return "Spotify RSS publishing";
    case "thumbnails": return "AI thumbnails / cover art";
    case "articles": return "article generation";
  }
}
