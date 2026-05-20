import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getCreditsForUser,
  getProjectsForUser,
  getUserById,
} from "@/lib/mock-data";
import { PLAN_LIMITS, LOCATION_LABEL } from "@/lib/types";
import { StatusPill } from "@/components/StatusPill";

export default function AdminClientDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const client = getUserById(params.id);
  if (!client) notFound();
  const credits = getCreditsForUser(client.id);
  const projects = getProjectsForUser(client.id);
  const limits = PLAN_LIMITS[client.plan];

  return (
    <>
      <Link href="/admin/clients" className="text-[13px] text-text-muted hover:text-text">
        ← All clients
      </Link>
      <div className="flex items-center gap-4 mt-4 mb-8">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center font-semibold"
          style={{ background: client.avatarColor }}
        >
          {client.avatar}
        </div>
        <div>
          <h1 className="display text-[32px]">
            {client.firstName} {client.lastName}
          </h1>
          <p className="text-text-muted text-[13px]">{client.email}</p>
        </div>
        <button className="ml-auto px-4 py-2 rounded-[10px] bg-accent text-white text-[13px] font-medium">
          Impersonate
        </button>
      </div>

      <section className="mb-8 p-6 rounded-[16px] bg-bg-elev border border-border">
        <h2 className="display text-[18px] mb-4">Plan & credits</h2>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-[12px] text-text-muted mb-2">Plan</label>
            <select defaultValue={client.plan} className="w-full px-4 py-2.5 bg-bg-elev-2 border border-border rounded-[10px] text-[13px]">
              <option value="onpod_studio">OnPod Studio (free bundle)</option>
              <option value="direct_base">OnPod Studio direct — $39 / mo</option>
              <option value="direct_double">OnPod Studio direct ×2 — $89 / mo</option>
              <option value="ext_studio_base">External clients — $89 / mo</option>
              <option value="ext_studio_double">External clients ×2 — $120 / mo</option>
              <option value="unlimited">Unlimited (admin)</option>
            </select>
          </div>
          <div>
            <label className="block text-[12px] text-text-muted mb-2">Credits reset</label>
            <input
              defaultValue={client.creditsResetAt.slice(0, 10)}
              className="w-full px-4 py-2.5 bg-bg-elev-2 border border-border rounded-[10px] text-[13px]"
            />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3 mt-6">
          {[
            { label: "Podcasts", used: credits?.podcastsUsed ?? 0, total: limits.podcasts, bonus: credits?.bonusPodcasts ?? 0 },
            { label: "Articles", used: credits?.articlesUsed ?? 0, total: limits.articles, bonus: credits?.bonusArticles ?? 0 },
            { label: "Clips", used: credits?.opusClipsUsed ?? 0, total: limits.opusClips, bonus: credits?.bonusOpusClips ?? 0 },
            { label: "Cover arts", used: credits?.coverArtsUsed ?? 0, total: limits.coverArts, bonus: credits?.bonusCoverArts ?? 0 },
          ].map((q) => (
            <div key={q.label} className="p-3 rounded-[10px] bg-bg-elev-2 border border-border">
              <div className="text-[11px] text-text-muted">{q.label}</div>
              <div className="display text-[20px] mt-1">
                {q.used} / {isFinite(q.total) ? q.total : "∞"}
              </div>
              <input
                placeholder={`+${q.bonus} bonus`}
                className="mt-2 w-full px-2 py-1 bg-bg-elev-3 border border-border rounded-[6px] text-[12px]"
              />
            </div>
          ))}
        </div>

        <button className="mt-6 px-4 py-2 rounded-[10px] bg-accent text-white text-[13px] font-medium">
          Save changes
        </button>
      </section>

      <section>
        <h2 className="display text-[20px] mb-4">Projects ({projects.length})</h2>
        <ul className="space-y-2">
          {projects.map((p) => (
            <li
              key={p.id}
              className="px-5 py-4 bg-bg-elev border border-border rounded-lg flex items-center gap-4"
            >
              <div className="flex-1">
                <div className="font-medium text-[14px]">{p.title}</div>
                <div className="text-[12px] text-text-muted mt-1">
                  {LOCATION_LABEL[p.location]} · {p.recordedAt} · {p.duration}
                </div>
              </div>
              <StatusPill status={p.status} />
              <Link
                href={`/account/projects/${p.id}`}
                className="text-[12px] px-3 py-1.5 rounded-[8px] bg-bg-elev-3 border border-border"
              >
                Open
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
