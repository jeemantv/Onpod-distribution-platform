"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PLAN_LIMITS, type Plan } from "@/lib/types";

const ORDERED_PLANS: Plan[] = [
  "free",
  "onpod_studio",
  "direct_base",
  "direct_double",
  "ext_studio_base",
  "ext_studio_double",
  "unlimited",
];

export function PlanSelector({
  clientId,
  currentPlan,
}: {
  clientId: string;
  currentPlan: string;
}) {
  const router = useRouter();
  const [plan, setPlan] = useState<string>(currentPlan);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const limit = (PLAN_LIMITS as Record<string, typeof PLAN_LIMITS[Plan]>)[plan];

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { message?: string }).message ?? `HTTP ${res.status}`);
      }
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={plan}
          onChange={(e) => {
            setPlan(e.target.value);
            setSaved(false);
          }}
          className="px-3 py-2 bg-bg-elev-2 border border-border rounded-[10px] text-[13px] min-w-[260px]"
        >
          {ORDERED_PLANS.map((p) => (
            <option key={p} value={p}>
              {PLAN_LIMITS[p].label}
            </option>
          ))}
        </select>
        <button
          onClick={save}
          disabled={saving || plan === currentPlan}
          className="px-4 py-2 rounded-[10px] bg-accent text-white text-[13px] font-medium disabled:opacity-50"
        >
          {saving ? "Saving…" : saved ? "✓ Saved" : "Save"}
        </button>
        {plan !== currentPlan ? (
          <span className="text-[11px] text-text-muted">
            Currently: {(PLAN_LIMITS as Record<string, { label: string }>)[currentPlan]?.label ?? currentPlan}
          </span>
        ) : null}
      </div>

      {limit ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12px]">
          <Cap label="Episodes / mo" value={limit.episodes} />
          <Cap label="Reels / mo" value={limit.reels} />
          <Cap label="Thumbnails / mo" value={limit.thumbnails} />
          <Cap label="Articles / mo" value={limit.articles} />
        </div>
      ) : null}

      <p className="text-[11px] text-text-dim">
        Changing the plan takes effect immediately for the client&apos;s next API
        call. They may need to sign in again to refresh their session payload.
      </p>

      {error ? (
        <div className="p-3 rounded-[10px] bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-[12px] text-[#f87171]">
          {error}
        </div>
      ) : null}
    </div>
  );
}

function Cap({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[8px] bg-bg-elev-2 border border-border px-3 py-2">
      <div className="text-text-muted">{label}</div>
      <div className="font-medium mt-0.5">{isFinite(value) ? value : "∞"}</div>
    </div>
  );
}
