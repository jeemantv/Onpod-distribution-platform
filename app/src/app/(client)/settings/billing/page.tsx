// Billing landing for clients. Lists every paid plan that has a
// Stripe price configured + a Subscribe button each. If the user
// already has a subscription, shows the Customer Portal link.

import { Suspense } from "react";
import { requireSession } from "@/lib/session";
import { getUserByEmail } from "@/lib/auth-store";
import { paidPlans, stripeConfigured, isSelfServePlan } from "@/lib/stripe";
import { PLAN_LIMITS } from "@/lib/types";
import { BillingActions } from "./_BillingActions";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const user = requireSession();
  const stored = await getUserByEmail(user.email);
  const currentPlan = stored?.plan ?? "free";
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

  return (
    <Suspense fallback={null}>
      <main className="max-w-[860px] mx-auto px-4 sm:px-8 py-8 sm:py-12">
        <h1 className="display text-[32px] sm:text-[40px]">Billing</h1>
        <p className="text-text-muted text-[13px] mt-1">
          Your current plan:{" "}
          <span className="text-text font-medium">
            {(PLAN_LIMITS as Record<string, { label: string }>)[currentPlan]?.label ?? currentPlan}
          </span>
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
