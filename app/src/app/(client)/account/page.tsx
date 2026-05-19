import Link from "next/link";
import { StatusPill } from "@/components/StatusPill";
import { TopNav } from "@/components/TopNav";
import { getProjectsForUser, getFilesForProject } from "@/lib/mock-data";
import { requireClient } from "@/lib/session";
import { LOCATION_LABEL } from "@/lib/types";
import { groupBy } from "@/lib/format";
import { ProjectMultiSelectBar } from "./_components/ProjectMultiSelectBar";
import { FolderCheckbox } from "./_components/FolderCheckbox";

function formatRecorded(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function AccountPage() {
  const user = requireClient();
  const projects = getProjectsForUser(user.id);
  const byYear = groupBy(projects, (p) => p.recordedAt.slice(0, 4));
  const years = Object.keys(byYear).sort().reverse();

  return (
    <>
      <TopNav user={user} />
      <main className="max-w-[1280px] mx-auto px-8 py-10 pb-32">
      <div className="flex items-start justify-between mb-8 flex-wrap gap-5">
        <div>
          <h1 className="display text-[42px]">Your sessions</h1>
          <p className="text-text-muted text-[13px] mt-1">
            All your OnPod recordings, grouped by year.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-[rgba(20,184,166,0.1)] text-accent-2 rounded-full text-[12px] font-medium">
            <span className="w-[6px] h-[6px] rounded-full bg-current" />
            {user.plan === "unlimited" ? "Unlimited admin" : `${user.plan} plan`}
          </span>
          <Link
            href="/settings"
            className="px-3 py-1.5 bg-bg-elev border border-border rounded-[8px] text-[12px] text-text-muted hover:text-text hover:border-border-strong"
          >
            Manage plan
          </Link>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="bg-bg-elev border border-border rounded-lg p-12 text-center">
          <p className="text-text-muted">
            No sessions yet. New recordings will appear here after your next OnPod session.
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          {years.map((year) => (
            <section key={year}>
              <h2 className="display text-[20px] text-text-muted mb-4">{year}</h2>
              <ul className="space-y-2" data-folder-list>
                {byYear[year].map((p) => {
                  const fileCount = getFilesForProject(p.id).length;
                  return (
                    <li key={p.id}>
                      <Link
                        href={`/account/projects/${p.id}`}
                        className="group flex items-center gap-4 px-5 py-4 bg-bg-elev border border-border rounded-lg hover:border-border-strong hover:bg-bg-elev-2 transition"
                      >
                        <FolderCheckbox projectId={p.id} />
                        <div className="w-10 h-10 rounded-md bg-bg-elev-3 flex items-center justify-center text-text-muted shrink-0">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="font-medium text-[14px]">
                              {formatRecorded(p.recordedAt)} — {LOCATION_LABEL[p.location]}
                            </span>
                            <StatusPill status={p.status} />
                          </div>
                          <p className="text-[12px] text-text-muted mt-1">
                            {LOCATION_LABEL[p.location]} studio · {p.cameraCount} cameras · {p.duration} · {fileCount} files
                          </p>
                        </div>
                        <span className="text-text-dim group-hover:text-text">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <ProjectMultiSelectBar />
      </main>
    </>
  );
}
