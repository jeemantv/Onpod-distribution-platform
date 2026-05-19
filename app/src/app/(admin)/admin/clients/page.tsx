import Link from "next/link";
import { mockUsers, mockCredits, mockProjects } from "@/lib/mock-data";
import { PLAN_LIMITS } from "@/lib/types";
import { formatDate } from "@/lib/format";

export default function AdminClientsPage() {
  const clients = mockUsers.filter((u) => u.role === "client");

  return (
    <>
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="display text-[36px]">Clients</h1>
          <p className="text-text-muted text-[13px] mt-1">
            {clients.length} active clients across all studios.
          </p>
        </div>
        <button className="px-4 py-2.5 rounded-[10px] bg-accent text-white text-[13px] font-medium">
          + Invite client
        </button>
      </div>

      <div className="bg-bg-elev border border-border rounded-[16px] overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-text-muted text-[11px] uppercase tracking-wider border-b border-border">
              <th className="text-left p-4 font-medium">Client</th>
              <th className="text-left p-4 font-medium">Plan</th>
              <th className="text-left p-4 font-medium">Usage</th>
              <th className="text-left p-4 font-medium">Projects</th>
              <th className="text-left p-4 font-medium">MRR</th>
              <th className="text-left p-4 font-medium">Joined</th>
              <th className="text-right p-4 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => {
              const credits = mockCredits.find((cr) => cr.userId === c.id);
              const projects = mockProjects.filter((p) => p.userId === c.id);
              const limit = PLAN_LIMITS[c.plan];
              const usagePct = credits
                ? Math.min(
                    100,
                    Math.round(
                      (credits.podcastsUsed / (isFinite(limit.podcasts) ? limit.podcasts : 99)) * 100,
                    ),
                  )
                : 0;
              return (
                <tr key={c.id} className="border-b border-border last:border-0 hover:bg-bg-elev-2">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center font-semibold text-[12px]"
                        style={{ background: c.avatarColor }}
                      >
                        {c.avatar}
                      </div>
                      <div>
                        <div className="font-medium">
                          {c.firstName} {c.lastName}
                        </div>
                        <div className="text-text-muted text-[11px]">{c.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className="inline-block px-2.5 py-1 rounded-full bg-bg-elev-3 border border-border text-[11px] capitalize">
                      {c.plan}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-bg-elev-3 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent"
                          style={{ width: `${usagePct}%` }}
                        />
                      </div>
                      <span className="text-text-muted text-[11px]">{usagePct}%</span>
                    </div>
                  </td>
                  <td className="p-4">{projects.length}</td>
                  <td className="p-4">${limit.priceCad} CAD</td>
                  <td className="p-4 text-text-muted">{formatDate(c.createdAt)}</td>
                  <td className="p-4 text-right">
                    <Link
                      href={`/admin/clients/${c.id}`}
                      className="inline-block px-3 py-1.5 rounded-[8px] bg-bg-elev-3 border border-border text-[12px] mr-2"
                    >
                      Manage
                    </Link>
                    <button className="inline-block px-3 py-1.5 rounded-[8px] bg-accent text-white text-[12px]">
                      Open
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
