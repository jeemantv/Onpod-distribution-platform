import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { requireClient } from "@/lib/session";
import { listClientSessions } from "@/lib/studio-store";
import { STUDIO_LABEL } from "@/lib/studio";
import { PLAN_LIMITS } from "@/lib/types";
import { getUserByEmail } from "@/lib/auth-store";
import { StartSessionButton } from "./_components/StartSessionButton";
import { SessionList } from "./_components/SessionList";

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
  const plan = PLAN_LIMITS[user.plan];
  // Self-upload toggle drives the "Start new session" button. One DB
  // read per page render so admin flips take effect on next reload.
  const stored = await getUserByEmail(user.email).catch(() => null);
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
            <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-[rgba(20,184,166,0.1)] text-accent-2 rounded-full text-[12px] font-medium">
              <span className="w-[6px] h-[6px] rounded-full bg-current" />
              {plan?.label ?? user.plan}
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
