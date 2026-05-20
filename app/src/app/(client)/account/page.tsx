import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { requireClient } from "@/lib/session";
import { listClientSessions } from "@/lib/studio-store";
import { STUDIO_LABEL } from "@/lib/studio";
import { PLAN_LIMITS } from "@/lib/types";

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
              href="/settings"
              className="px-3 py-1.5 bg-bg-elev border border-border rounded-[8px] text-[12px] text-text-muted hover:text-text hover:border-border-strong"
            >
              Manage plan
            </Link>
          </div>
        </div>

        {sessions.length === 0 ? (
          <div className="bg-bg-elev border border-border rounded-lg p-12 text-center">
            <p className="text-text-muted">
              No sessions yet. New recordings will appear here after your next OnPod session.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {sessions.map((s) => (
              <li key={`${s.studio}/${s.folder}`}>
                <Link
                  href={`/account/sessions/${s.studio}/${encodeURIComponent(s.folder)}`}
                  className="group flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 sm:py-4 bg-bg-elev border border-border rounded-lg hover:border-border-strong hover:bg-bg-elev-2 transition"
                >
                  <div className="w-10 h-10 rounded-md bg-bg-elev-3 flex items-center justify-center text-text-muted shrink-0">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[13px] sm:text-[14px]">
                      {s.parsed ? `${s.parsed.date} ${s.parsed.time}` : s.folder}{" "}
                      — {STUDIO_LABEL[s.studio]}
                    </div>
                    <p className="text-[11px] sm:text-[12px] text-text-muted mt-1">
                      {s.fileCount} files · {fmtBytes(s.sizeBytes)}
                      {s.lastModified ? (
                        <> · {new Date(s.lastModified).toLocaleDateString()}</>
                      ) : null}
                    </p>
                  </div>
                  <span className="text-text-dim group-hover:text-text shrink-0">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
