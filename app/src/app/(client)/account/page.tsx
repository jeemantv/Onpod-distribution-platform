import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { requireClient } from "@/lib/session";
import { listClientSessions } from "@/lib/studio-store";
import { STUDIO_LABEL } from "@/lib/studio";
import { PLAN_LIMITS } from "@/lib/types";
import { effectivePlan, getUserByEmail, trialStateFor } from "@/lib/auth-store";
import { StartSessionButton } from "./_components/StartSessionButton";
import { SessionList } from "./_components/SessionList";
import { StudioReferralCard } from "./_components/StudioReferralCard";

export const dynamic = "force-dynamic";

function fmtBytes(n: number): string {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default async function AccountPage() {
  const user = requireClient();
  // The legacy mockProjects + /account/projects/[id] flow is gone from
  // the client view. The only source of truth is the studio path tree
  // in B2 — sessions are picked up by matching the folder email to the
  // logged-in user's email.
  const sessions = await listClientSessions(user.email).catch(() => []);
  // Self-upload toggle + plan resolution both read from the DB. The
  // session JWT lags Stripe / trial transitions, so we resolve fresh
  // every render — one query, worth the correctness.
  const stored = await getUserByEmail(user.email).catch(() => null);
  const livePlan = stored ? effectivePlan(stored) : user.plan;
  const planLimits = (PLAN_LIMITS as Record<string, (typeof PLAN_LIMITS)[keyof typeof PLAN_LIMITS]>)[livePlan];
  const trial = stored ? trialStateFor(stored) : { active: false, daysLeft: 0, endsAt: null };
  // Display label: trial users see "Free trial · N days left" (not the
  // raw "Unlimited (admin)" label they'd otherwise get). Everyone else
  // sees the actual plan label.
  const planTagLabel = trial.active
    ? `Free trial · ${trial.daysLeft} day${trial.daysLeft === 1 ? "" : "s"} left`
    : planLimits?.label ?? livePlan;
  const planTagTone = trial.active
    ? "bg-[rgba(16,185,129,0.12)] text-[#34d399]"
    : livePlan === "free"
      ? "bg-[rgba(245,158,11,0.12)] text-[#fbbf24]"
      : "bg-[rgba(20,184,166,0.1)] text-accent-2";
  const canStartSession = !!stored?.selfUploadEnabled;
  const homeStudio = stored?.homeStudio ?? "externals";

  return (
    <>
      <TopNav user={user} />
      <main className="max-w-[1280px] mx-auto px-4 sm:px-8 py-6 sm:py-10 pb-32">
        <div className="flex items-start justify-between mb-6 sm:mb-8 flex-wrap gap-4 sm:gap-5">
          <div>
            <h1 className="display text-[32px] sm:text-[42px]">Your sessions</h1>
            <p className="text-text-muted text-[13px] mt-1">
              Every recording uploaded for {user.email}.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-medium ${planTagTone}`}>
              <span className="w-[6px] h-[6px] rounded-full bg-current" />
              {planTagLabel}
            </span>
            <Link
              href="/settings/billing"
              className="px-3 py-1.5 bg-bg-elev border border-border rounded-[8px] text-[12px] text-text-muted hover:text-text hover:border-border-strong"
            >
              Manage plan
            </Link>
            {canStartSession ? (
              <StartSessionButton homeStudio={homeStudio} email={user.email} />
            ) : null}
          </div>
        </div>

        {homeStudio === "externals" ? (
          <StudioReferralCard
            clientFirstName={user.firstName}
            clientEmail={user.email}
          />
        ) : null}

        <SessionList
          sessions={sessions.map((s) => ({
            studio: s.studio,
            studioLabel: STUDIO_LABEL[s.studio] ?? s.studio,
            folder: s.folder,
            parsed: s.parsed
              ? {
                  date: s.parsed.date,
                  time: s.parsed.time,
                  email: s.parsed.email,
                }
              : null,
            fileCount: s.fileCount,
            sizeBytes: s.sizeBytes,
            lastModified: s.lastModified,
          }))}
        />
      </main>
    </>
  );
}
