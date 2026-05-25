"use client";

import { useState } from "react";

interface LinkPlan {
  plan: string;
  url: string;
  label: string;
  priceUsd: number;
  priceCad?: number;
}

interface TrialLink {
  key: string;
  url: string;
  label: string;
  plan: string;
  trialDays: number;
  priceCad: number;
}

export function StripeLinksPanel({
  links,
  trials = [],
}: {
  links: LinkPlan[];
  trials?: TrialLink[];
}) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (url: string, key: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  if (links.length === 0 && trials.length === 0) {
    return (
      <div className="p-4 rounded-[12px] bg-bg-elev border border-border text-[13px] text-text-muted">
        No payment links configured. Set <code>STRIPE_LINK_*</code> env vars in
        Vercel.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {links.length > 0 ? (
        <section>
          <h2 className="text-[14px] font-medium mb-3 text-text-muted uppercase tracking-wider">
            Plan links
          </h2>
          <ul className="space-y-3">
            {links.map((p) => (
              <li
                key={p.plan}
                className="p-4 rounded-[14px] bg-bg-elev border border-border"
              >
                <div className="flex items-baseline justify-between mb-2">
                  <div className="font-medium text-[14px]">{p.label}</div>
                  <div className="text-text-muted text-[12px]">
                    ${p.priceCad ?? p.priceUsd}
                    <span className="text-text-dim"> CAD/mo</span>
                  </div>
                </div>
                <div className="text-[10px] text-text-dim font-mono mb-3">{p.plan}</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    readOnly
                    value={p.url}
                    onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 min-w-[280px] px-3 py-2 bg-bg-elev-2 border border-border rounded-[8px] text-[12px] font-mono text-text-muted"
                  />
                  <button
                    onClick={() => copy(p.url, `plan:${p.plan}`)}
                    className="px-3 py-2 rounded-[8px] bg-accent text-white text-[12px] font-medium"
                  >
                    {copied === `plan:${p.plan}` ? "✓ Copied" : "Copy link"}
                  </button>
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-2 rounded-[8px] bg-bg-elev-2 border border-border text-[12px] text-text-muted hover:text-text"
                  >
                    Open ↗
                  </a>
                </div>
                <p className="text-[11px] text-text-dim mt-2">
                  DM / email this URL. Charges immediately. OnPod matches by
                  email and flips the plan to {p.label}.
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {trials.length > 0 ? (
        <section>
          <h2 className="text-[14px] font-medium mb-3 text-text-muted uppercase tracking-wider">
            Trial / promo links
          </h2>
          <ul className="space-y-3">
            {trials.map((t) => (
              <li
                key={t.key}
                className="p-4 rounded-[14px] bg-bg-elev border border-[#fbbf24]/30 relative"
              >
                <span className="absolute top-3 right-3 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[rgba(251,191,36,0.15)] text-[#fbbf24] border border-[rgba(251,191,36,0.3)]">
                  {t.trialDays}-day trial
                </span>
                <div className="font-medium text-[14px] mb-1 pr-24">{t.label}</div>
                <div className="text-text-muted text-[12px] mb-3">
                  $0 today, then ${t.priceCad} CAD/mo
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    readOnly
                    value={t.url}
                    onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 min-w-[280px] px-3 py-2 bg-bg-elev-2 border border-border rounded-[8px] text-[12px] font-mono text-text-muted"
                  />
                  <button
                    onClick={() => copy(t.url, `trial:${t.key}`)}
                    className="px-3 py-2 rounded-[8px] bg-accent text-white text-[12px] font-medium"
                  >
                    {copied === `trial:${t.key}` ? "✓ Copied" : "Copy link"}
                  </button>
                  <a
                    href={t.url}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-2 rounded-[8px] bg-bg-elev-2 border border-border text-[12px] text-text-muted hover:text-text"
                  >
                    Open ↗
                  </a>
                </div>
                <p className="text-[11px] text-text-dim mt-2">
                  Embed on your website / share publicly. Card required up
                  front but $0 charged for {t.trialDays} days. Auto-cancels
                  if no card. After trial: charges ${t.priceCad} CAD/mo.
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
