// Billing landing for clients. Lists every paid plan that has a
// Stripe price configured + a Subscribe button each. If the user
// already has a subscription, shows the Customer Portal link.
//
// When Stripe redirects back with ?status=success, we refresh the
// session cookie so the rest of the app picks up the new plan
// immediately (no re-login needed), and surface a confirmation card
// with a back-to-dashboard CTA.

import Link from "next/link";
import { Suspense } from "react";
import { TopNav } from "@/components/TopNav";
import { requireSession, setSession } from "@/lib/session";
import { effectivePlan, getUserByEmail } from "@/lib/auth-store";
import { paidPlans, stripeConfigured, isSelfServePlan } from "@/lib/stripe";
import { PLAN_LIMITS } from "@/lib/types";
import { BillingActions } from "./_BillingActions";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: { status?: string; session_id?: string };
}) {
  const user = requireSession();
  const stored = await getUserByEmail(user.email);
  const currentPlan = stored ? effectivePlan(stored) : user.plan;
  const successfulCheckout = searchParams.status === "success";

  // Re-issue the session JWT with the fresh DB-side plan so the rest of
  // the app (FilePortal, FileActionButtons, etc.) stops gating on the
  // stale trial/free plan from the old cookie.
  if (successfulCheckout && stored) {
    setSession({
      id: stored.id,
      email: stored.email,
      firstName: stored.firstName,
      lastName: stored.lastName,
      avatar: stored.avatar,
      avatarColor: stored.avatarColor,
      role: stored.role,
      plan: currentPlan as typeof user.plan,
    });
  }
  // Self-serve plans only — admin-link plans (direct_*) live in
  // /admin/integrations/stripe and are sent to clients individually.
  const plans = paidPlans().filter((p) => isSelfServePlan(p.plan));
  const configured = stripeConfigured();
  // The Manage section only makes sense once a Stripe customer exists.
  // Read the column directly since StoredUser doesn't carry it through.
  const [row] = stored
    ? await db
        .select({ sc: users.stripeCustomerId })
        .from(users)
        .where(eq(users.id, stored.id))
        .limit(1)
    : [];
  const hasStripeCustomer = !!row?.sc;

  const planLabel =
    (PLAN_LIMITS as Record<string, { label: string }>)[currentPlan]?.label ??
    currentPlan;

  return (
    <Suspense fallback={null}>
      <TopNav user={user} backHref="/account" backLabel="Back to dashboard" />
      <main className="max-w-[860px] mx-auto px-4 sm:px-8 py-8 sm:py-12">
        {successfulCheckout ? (
          <section className="mb-8 p-6 rounded-[16px] bg-[rgba(16,185,129,0.08)] border border-[rgba(16,185,129,0.3)]">
            <div className="flex items-start gap-4 flex-wrap">
              <div className="w-12 h-12 rounded-full bg-[rgba(16,185,129,0.18)] text-[#34d399] flex items-center justify-center shrink-0">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-[18px] font-medium">You&apos;re subscribed to {planLabel}</h2>
                <p className="text-[13px] text-text-muted mt-1">
                  AI, YouTube, Buzzsprout, clips, and the rest are unlocked.
                  Head back to your dashboard to keep working.
                </p>
              </div>
              <Link
                href="/account"
                className="px-5 py-2.5 rounded-[10px] bg-accent text-white text-[13px] font-medium shrink-0"
              >
                Back to dashboard →
              </Link>
            </div>
          </section>
        ) : null}

        <h1 className="display text-[32px] sm:text-[40px]">Billing</h1>
        <p className="text-text-muted text-[13px] mt-1">
          Your current plan:{" "}
          <span className="text-text font-medium">{planLabel}</span>
        </p>

        {!configured ? (
          <div className="mt-8 p-4 rounded-[12px] bg-[rgba(245,158,11,0.08)] border border-[rgba(245,158,11,0.25)] text-[13px] text-[#fbbf24]">
            Stripe isn&apos;t configured yet on this deployment. Subscribing is
            disabled until <code>STRIPE_SECRET_KEY</code> + per-plan{" "}
            <code>STRIPE_PRICE_*</code> env vars are set.
          </div>
        ) : null}

        <section className="mt-8 grid sm:grid-cols-2 gap-3">
          {plans.length === 0 ? (
            <div className="col-span-full p-6 rounded-[12px] bg-bg-elev border border-border text-text-muted text-[13px]">
              No purchasable plans configured. Set per-plan Stripe price IDs in
              Vercel env (e.g. <code>STRIPE_PRICE_DIRECT_BASE</code>).
            </div>
          ) : (
            plans.map((p) => {
              const isCurrent = currentPlan === p.plan;
              const limit = PLAN_LIMITS[p.plan];
              return (
                <div
                  key={p.plan}
                  className={`p-5 rounded-[14px] border ${
                    isCurrent ? "border-accent bg-[rgba(255,59,48,0.06)]" : "border-border bg-bg-elev"
                  }`}
                >
                  <div className="flex items-baseline justify-between">
                    <div className="font-medium text-[15px]">{p.label}</div>
                    <div className="text-text-muted text-[12px]">
                      ${limit.priceCad}
                      <span className="text-text-dim"> CAD/mo</span>
                    </div>
                  </div>
                  <ul className="mt-3 space-y-1 text-[12px] text-text-muted">
                    <li>{limit.episodes} episodes / month</li>
                    <li>{limit.reels} reels / month</li>
                    <li>{limit.thumbnails} thumbnails / month</li>
                    <li>{limit.articles} articles / month</li>
                  </ul>
                  <div className="mt-4">
                    <BillingActions
                      plan={p.plan}
                      isCurrent={isCurrent}
                      stripeConfigured={configured}
                    />
                  </div>
                </div>
              );
            })
          )}
        </section>

        {hasStripeCustomer ? (
          <section className="mt-10 p-5 rounded-[14px] bg-bg-elev border border-border">
            <h2 className="text-[14px] font-medium mb-1">Manage subscription</h2>
            <p className="text-text-muted text-[12px] mb-3">
              Update card, switch plans, cancel — all via Stripe&apos;s portal.
            </p>
            <BillingActions portal isCurrent={false} plan="free" stripeConfigured={configured} />
          </section>
        ) : (
          <section className="mt-10 p-5 rounded-[14px] bg-bg-elev-2 border border-border text-text-muted text-[12px]">
            Manage subscription is available after your first checkout. Pick a
            plan above to subscribe.
          </section>
        )}
      </main>
    </Suspense>
  );
}
