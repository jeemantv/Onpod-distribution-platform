// Real clients list — pulls from the B2 user store + merges any mock
// demo accounts. For each client we look at their actual B2 footage
// (sessions in studios/.../clients/ folders matching their email) so
// admins / editors see what's really there, not mock numbers.

import Link from "next/link";
import { requireEditorOrAdmin } from "@/lib/session";
import { listAllUsers } from "@/lib/auth-store";
import { mockUsers } from "@/lib/mock-data";
import { listClientSessions } from "@/lib/studio-store";
import { loadEditorScope } from "@/lib/editor-access";
import { PLAN_LIMITS } from "@/lib/types";

export const dynamic = "force-dynamic";

function fmtBytes(n: number): string {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default async function AdminClientsPage() {
  const user = requireEditorOrAdmin();
  const scope = await loadEditorScope(user);
  const stored = await listAllUsers();
  const seen = new Set(stored.map((u) => u.email.toLowerCase()));

  const allClients = [
    ...stored.filter((u) => u.role === "client"),
    ...mockUsers.filter(
      (u) => u.role === "client" && !seen.has(u.email.toLowerCase()),
    ),
  ];

  const visibleClients = allClients.filter(
    (c) => !scope.excludedClientEmails.has(c.email.toLowerCase()),
  );

  // Walk each client's real B2 sessions
  const rows = await Promise.all(
    visibleClients.map(async (c) => {
      const sessions = await listClientSessions(c.email).catch(() => []);
      const totalSize = sessions.reduce((acc, s) => acc + s.sizeBytes, 0);
      const totalFiles = sessions.reduce((acc, s) => acc + s.fileCount, 0);
      const lastSession = sessions[0]?.lastModified ?? null;
      // Only User has `plan`; StoredUser doesn't carry it. Default sane.
      const planSource = (c as { plan?: string }).plan;
      return {
        id: c.id,
        email: c.email,
        firstName: c.firstName,
        lastName: c.lastName,
        avatar: c.avatar,
        avatarColor: c.avatarColor,
        plan: (planSource ?? "direct_base") as keyof typeof PLAN_LIMITS,
        sessionCount: sessions.length,
        totalFiles,
        totalSize,
        lastSession,
      };
    }),
  );

  rows.sort((a, b) => (b.lastSession ?? "").localeCompare(a.lastSession ?? ""));

  return (
    <>
      <div className="mb-8">
        <h1 className="display text-[36px]">Clients</h1>
        <p className="text-text-muted text-[13px] mt-1">
          {rows.length} client{rows.length === 1 ? "" : "s"} with real footage in B2.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="bg-bg-elev border border-border rounded-lg p-12 text-center">
          <p className="text-text-muted text-[13px]">No clients yet.</p>
        </div>
      ) : (
        <div className="bg-bg-elev border border-border rounded-[16px] overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-text-muted text-[11px] uppercase tracking-wider border-b border-border">
                <th className="text-left p-4 font-medium">Client</th>
                <th className="text-left p-4 font-medium">Plan</th>
                <th className="text-left p-4 font-medium">Sessions</th>
                <th className="text-left p-4 font-medium">Files</th>
                <th className="text-left p-4 font-medium">Storage</th>
                <th className="text-left p-4 font-medium">Last activity</th>
                <th className="text-right p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const limit = PLAN_LIMITS[c.plan];
                return (
                  <tr
                    key={c.id}
                    className="border-b border-border last:border-0 hover:bg-bg-elev-2"
                  >
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
                          <div className="text-text-muted text-[11px]">
                            {c.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="inline-block px-2.5 py-1 rounded-full bg-bg-elev-3 border border-border text-[11px]">
                        {limit?.label ?? c.plan}
                      </span>
                    </td>
                    <td className="p-4">{c.sessionCount}</td>
                    <td className="p-4">{c.totalFiles}</td>
                    <td className="p-4">{fmtBytes(c.totalSize)}</td>
                    <td className="p-4 text-text-muted">
                      {c.lastSession
                        ? new Date(c.lastSession).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="p-4 text-right">
                      {user.role === "admin" ? (
                        <Link
                          href={`/admin/clients/${c.id}`}
                          className="inline-block px-3 py-1.5 rounded-[8px] bg-bg-elev-3 border border-border text-[12px]"
                        >
                          Manage
                        </Link>
                      ) : (
                        <span className="text-text-dim text-[11px]">view only</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
