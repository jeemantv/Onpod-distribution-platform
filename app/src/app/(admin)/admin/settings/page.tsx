import { PLAN_LIMITS, type Plan } from "@/lib/types";

const INTEGRATIONS = [
  { key: "DEEPGRAM_API_KEY", label: "Deepgram (transcription)" },
  { key: "ANTHROPIC_API_KEY", label: "Anthropic Claude (AI content)" },
  { key: "OPUSCLIP_API_KEY", label: "OpusClip (short clips)" },
  { key: "YOUTUBE_CLIENT_ID", label: "YouTube OAuth" },
  { key: "STRIPE_SECRET_KEY", label: "Stripe (billing)" },
  { key: "STRIPE_WEBHOOK_SECRET", label: "Stripe webhook signature" },
  { key: "RESEND_API_KEY", label: "Resend (email)" },
  { key: "B2_KEY_ID", label: "Backblaze B2 (storage)" },
  { key: "BANNERBEAR_API_KEY", label: "Bannerbear (thumbnails)" },
  { key: "REMOVE_BG_API_KEY", label: "remove.bg (background cutout)" },
  { key: "GEMINI_API_KEY", label: "Gemini (image enhancement)" },
];

const PRICING_PLANS: Plan[] = [
  "onpod_studio",
  "direct_base",
  "direct_double",
  "ext_studio_base",
  "ext_studio_double",
  "unlimited",
];

export default function AdminSettingsPage() {
  return (
    <>
      <h1 className="display text-[36px] mb-2">Platform settings</h1>
      <p className="text-text-muted text-[13px] mb-8">
        Integration health and plan pricing.
      </p>

      <section className="mb-8 p-6 rounded-[16px] bg-bg-elev border border-border">
        <h2 className="display text-[18px] mb-4">Integrations</h2>
        <ul className="divide-y divide-border">
          {INTEGRATIONS.map((i) => {
            const ok = !!process.env[i.key];
            return (
              <li key={i.key} className="py-3 flex items-center gap-4">
                <div className="flex-1">
                  <div className="text-[13px]">{i.label}</div>
                  <code className="text-[11px] text-text-dim">{i.key}</code>
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] ${
                    ok
                      ? "bg-[rgba(16,185,129,0.12)] text-[#34d399]"
                      : "bg-[rgba(245,158,11,0.12)] text-[#fbbf24]"
                  }`}
                >
                  <span className="w-[6px] h-[6px] rounded-full bg-current" />
                  {ok ? "Configured" : "Missing key"}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="p-6 rounded-[16px] bg-bg-elev border border-border">
        <h2 className="display text-[18px] mb-4">Plan pricing</h2>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-text-muted text-[11px] uppercase tracking-wider border-b border-border">
              <th className="text-left p-3 font-medium">Plan</th>
              <th className="text-left p-3 font-medium">Price (CAD/mo)</th>
              <th className="text-left p-3 font-medium">Episodes</th>
              <th className="text-left p-3 font-medium">Reels</th>
              <th className="text-left p-3 font-medium">Thumbnails</th>
              <th className="text-left p-3 font-medium">Articles</th>
            </tr>
          </thead>
          <tbody>
            {PRICING_PLANS.map((p) => {
              const plan = PLAN_LIMITS[p];
              return (
                <tr key={p} className="border-b border-border last:border-0">
                  <td className="p-3">{plan.label}</td>
                  <td className="p-3 text-text-muted">
                    {plan.priceCad === 0 ? "free" : `$${plan.priceCad}`}
                  </td>
                  <td className="p-3">{cap(plan.episodes)}</td>
                  <td className="p-3">{cap(plan.reels)}</td>
                  <td className="p-3">{cap(plan.thumbnails)}</td>
                  <td className="p-3">{cap(plan.articles)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}

function cap(n: number): string {
  return isFinite(n) ? String(n) : "∞";
}
