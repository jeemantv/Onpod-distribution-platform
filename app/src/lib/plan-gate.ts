// Plan-based feature gating. Each "feature" maps to a credit category;
// a plan can use the feature when that category's limit is > 0.
//
// Server routes call `assertCanUse(user, feature)` before consuming a
// credit; clients use `canUse(user, feature)` to decide whether to grey
// out a button. Both paths share PLAN_LIMITS so they stay in sync.

import { PLAN_LIMITS, type Plan } from "./types";

export type GatedFeature =
  | "ai" // transcription + AI metadata generation
  | "clips" // OpusClip / Vizard short-form clip generation
  | "youtube" // YouTube upload
  | "spotify" // Spotify RSS publish
  | "thumbnails" // AI thumbnail / cover art generation
  | "articles"; // long-form article generation

const FEATURE_TO_CATEGORY: Record<GatedFeature, keyof typeof CATEGORY_KEY> = {
  ai: "podcasts",
  clips: "opusClips",
  youtube: "podcasts",
  spotify: "podcasts",
  thumbnails: "coverArts",
  articles: "articles",
};

// Discriminator for which credit field on PlanLimit the feature maps to.
const CATEGORY_KEY = {
  podcasts: "podcasts" as const,
  opusClips: "opusClips" as const,
  coverArts: "coverArts" as const,
  articles: "articles" as const,
};

/** True if a user on `plan` is allowed to invoke `feature`. */
export function canUse(plan: Plan | string, feature: GatedFeature): boolean {
  const limit = (PLAN_LIMITS as Record<string, typeof PLAN_LIMITS[Plan]>)[plan];
  if (!limit) return false;
  const key = FEATURE_TO_CATEGORY[feature];
  return (limit[key] ?? 0) > 0;
}

/** Throws a tagged error suitable for converting to a 402 response. */
export class GatedError extends Error {
  feature: GatedFeature;
  plan: string;
  constructor(plan: string, feature: GatedFeature) {
    super(
      `Plan "${plan}" doesn't include ${feature}. Ask an admin to assign a paid plan.`,
    );
    this.feature = feature;
    this.plan = plan;
    this.name = "GatedError";
  }
}

export function assertCanUse(plan: Plan | string, feature: GatedFeature): void {
  if (!canUse(plan, feature)) throw new GatedError(plan, feature);
}

/** A user object minimally shaped for gating. Both User and StoredUser fit. */
interface PlanCarrier {
  plan?: Plan | string;
  role?: string;
}

/** Convenience wrapper that also lets admin/editor bypass for testing. */
export function userCanUse(user: PlanCarrier, feature: GatedFeature): boolean {
  if (user.role === "admin" || user.role === "editor") return true;
  return canUse(user.plan ?? "free", feature);
}
