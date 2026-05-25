"use client";

// Subscribe / Manage buttons. POSTs to /api/stripe/checkout (or
// /api/stripe/portal) and redirects to the URL Stripe returns.

import { useState } from "react";
import type { Plan } from "@/lib/types";

export function BillingActions({
  plan,
  isCurrent,
  stripeConfigured,
  portal,
}: {
  plan: Plan;
  isCurrent: boolean;
  stripeConfigured: boolean;
  // When true, the button opens the Stripe customer portal instead of
  // creating a new checkout. Used by the "Manage subscription" card.
  portal?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const click = async () => {
    setBusy(true);
    setError(null);
    try {
      const url = portal ? "/api/stripe/portal" : "/api/stripe/checkout";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: portal ? undefined : JSON.stringify({ plan }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !(data as { url?: string }).url) {
        throw new Error(
          (data as { message?: string }).message ?? `HTTP ${res.status}`,
        );
      }
      window.location.href = (data as { url: string }).url;
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  if (portal) {
    return (
      <div>
        <button
          onClick={click}
          disabled={busy || !stripeConfigured}
          className="px-4 py-2 rounded-[10px] bg-bg-elev-3 border border-border text-[13px] font-medium hover:border-border-strong disabled:opacity-50"
        >
          {busy ? "Opening…" : "Manage in Stripe →"}
        </button>
        {error ? <p className="text-[12px] text-danger mt-2">{error}</p> : null}
      </div>
    );
  }

  if (isCurrent) {
    return (
      <span className="inline-block px-3 py-1.5 rounded-[8px] bg-bg-elev-3 border border-border text-[12px] text-text-muted">
        Current plan
      </span>
    );
  }

  return (
    <div>
      <button
        onClick={click}
        disabled={busy || !stripeConfigured}
        className="w-full px-4 py-2.5 rounded-[10px] bg-accent text-white text-[13px] font-medium hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Redirecting…" : "Subscribe"}
      </button>
      {error ? <p className="text-[12px] text-danger mt-2">{error}</p> : null}
    </div>
  );
}
