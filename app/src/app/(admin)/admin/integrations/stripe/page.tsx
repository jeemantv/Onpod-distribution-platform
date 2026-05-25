// Super-admin Stripe panel: lists the payment links for plans that
// are NOT shown in client self-serve billing. Admin copies the link
// and sends it to a specific client.

import { requireAdmin } from "@/lib/session";
import { loadEditorScope } from "@/lib/editor-access";
import { notFound } from "next/navigation";
import { adminLinkPlans, adminTrialLinks, stripeConfigured } from "@/lib/stripe";
import { StripeLinksPanel } from "./_components/StripeLinksPanel";

export const dynamic = "force-dynamic";

export default async function StripeIntegrationPage() {
  const user = requireAdmin();
  // Super-admin only (scoped admins shouldn't manage OnPod-level billing).
  const scope = await loadEditorScope(user);
  if (scope.studios !== null) notFound();

  return (
    <>
      <div className="mb-2 text-[12px] text-text-muted">
        Integrations / <span className="text-text">Stripe</span>
      </div>
      <h1 className="display text-[32px] mb-2">Stripe billing</h1>
      <p className="text-text-muted text-[13px] mb-6">
        Shareable payment links for plans that aren&apos;t self-serve.
        Send the URL to a specific client &mdash; they don&apos;t need to
        sign in first to pay.
      </p>

      {!stripeConfigured() ? (
        <div className="p-4 rounded-[12px] bg-[rgba(245,158,11,0.08)] border border-[rgba(245,158,11,0.25)] text-[13px] text-[#fbbf24]">
          Stripe isn&apos;t configured on this deployment. Set
          <code className="mx-1">STRIPE_SECRET_KEY</code> and the per-plan
          <code className="mx-1">STRIPE_LINK_*</code> env vars in Vercel.
        </div>
      ) : (
        <StripeLinksPanel links={adminLinkPlans()} trials={adminTrialLinks()} />
      )}
    </>
  );
}
