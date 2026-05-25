// OnPod-managed Stripe wrapper. All money flows through one OnPod
// account; per-studio billing was demoted in Phase 3.2. Plans live in
// lib/types.ts (PLAN_LIMITS) — for each paid plan we read a price ID
// from env vars. When STRIPE_SECRET_KEY is missing, the helpers throw a
// tagged error the routes can convert into a friendly "Stripe not
// configured" response.

import "server-only";
import Stripe from "stripe";
import { PLAN_LIMITS, type Plan } from "./types";

const SECRET = process.env.STRIPE_SECRET_KEY;

export class StripeNotConfiguredError extends Error {
  constructor() {
    super(
      "Stripe isn't configured yet. Set STRIPE_SECRET_KEY + per-plan STRIPE_PRICE_* env vars.",
    );
    this.name = "StripeNotConfiguredError";
  }
}

let _client: Stripe | null = null;
export function stripe(): Stripe {
  if (!SECRET) throw new StripeNotConfiguredError();
  if (_client) return _client;
  _client = new Stripe(SECRET, {
    // Lock API version so a Stripe-side rollout doesn't break us. Bump
    // intentionally when migrating.
    apiVersion: "2026-04-22.dahlia",
    appInfo: { name: "OnPod", version: "1.0.0" },
  });
  return _client;
}

export function stripeConfigured(): boolean {
  return !!SECRET;
}

// Mapping plan → env-var holding the Stripe price ID. Super-admin
// creates the Products + Prices in Stripe dashboard, then sets these.
const PLAN_PRICE_ENV: Partial<Record<Plan, string>> = {
  onpod_studio: "STRIPE_PRICE_ONPOD_STUDIO",
  direct_base: "STRIPE_PRICE_DIRECT_BASE",
  direct_double: "STRIPE_PRICE_DIRECT_DOUBLE",
  ext_studio_base: "STRIPE_PRICE_EXT_STUDIO_BASE",
  ext_studio_double: "STRIPE_PRICE_EXT_STUDIO_DOUBLE",
  // free + unlimited intentionally absent — those are app-level, not paid.
};

export function priceIdForPlan(plan: Plan): string | null {
  const envName = PLAN_PRICE_ENV[plan];
  if (!envName) return null;
  return process.env[envName] ?? null;
}

export function paidPlans(): Array<{ plan: Plan; priceId: string; label: string; priceUsd: number }> {
  const out: Array<{ plan: Plan; priceId: string; label: string; priceUsd: number }> = [];
  for (const [plan, envName] of Object.entries(PLAN_PRICE_ENV) as [Plan, string][]) {
    const priceId = process.env[envName];
    if (!priceId) continue;
    const limit = PLAN_LIMITS[plan];
    out.push({ plan, priceId, label: limit.label, priceUsd: limit.priceUsd });
  }
  // Sort by price ascending so the cheapest plan renders first.
  out.sort((a, b) => a.priceUsd - b.priceUsd);
  return out;
}

// Plans that are NOT self-serveable from /settings/billing. Admin sends
// a shareable Stripe Payment Link to the client instead. Keys are env
// vars holding the buy.stripe.com URL.
const PLAN_PAYMENT_LINK_ENV: Partial<Record<Plan, string>> = {
  direct_base: "STRIPE_LINK_DIRECT_BASE",
  direct_double: "STRIPE_LINK_DIRECT_DOUBLE",
};

export function paymentLinkForPlan(plan: Plan): string | null {
  const envName = PLAN_PAYMENT_LINK_ENV[plan];
  if (!envName) return null;
  return process.env[envName] ?? null;
}

export function adminLinkPlans(): Array<{ plan: Plan; url: string; label: string; priceUsd: number; priceCad: number }> {
  const out: Array<{ plan: Plan; url: string; label: string; priceUsd: number; priceCad: number }> = [];
  for (const [plan, envName] of Object.entries(PLAN_PAYMENT_LINK_ENV) as [Plan, string][]) {
    const url = process.env[envName];
    if (!url) continue;
    const limit = PLAN_LIMITS[plan];
    out.push({ plan, url, label: limit.label, priceUsd: limit.priceUsd, priceCad: limit.priceCad });
  }
  out.sort((a, b) => a.priceUsd - b.priceUsd);
  return out;
}

// Trial / promo payment links. Keyed independently from PLAN_PAYMENT_LINK_ENV
// since a trial isn't really a "different plan" — it's a different
// payment link that converts to a plan after N days.
interface TrialLink {
  key: string;
  url: string;
  label: string;
  /** Plan the trial converts to after the trial period. */
  plan: Plan;
  /** Days of free trial. Informational. */
  trialDays: number;
  /** Display price (CAD) after the trial. */
  priceCad: number;
}

const TRIAL_LINKS: Array<Omit<TrialLink, "url"> & { envName: string }> = [
  {
    key: "trial_starter",
    envName: "STRIPE_LINK_TRIAL_STARTER",
    label: "7-day trial → Starter",
    plan: "ext_studio_base",
    trialDays: 7,
    priceCad: 122,
  },
];

export function adminTrialLinks(): TrialLink[] {
  const out: TrialLink[] = [];
  for (const t of TRIAL_LINKS) {
    const url = process.env[t.envName];
    if (!url) continue;
    out.push({
      key: t.key,
      url,
      label: t.label,
      plan: t.plan,
      trialDays: t.trialDays,
      priceCad: t.priceCad,
    });
  }
  return out;
}

/** True if a plan is shown to clients in self-serve /settings/billing. */
export function isSelfServePlan(plan: Plan): boolean {
  return !PLAN_PAYMENT_LINK_ENV[plan];
}

/** Resolves the absolute origin to use for Stripe success/cancel URLs. */
export function siteOrigin(req: Request): string {
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return new URL(req.url).origin;
}
