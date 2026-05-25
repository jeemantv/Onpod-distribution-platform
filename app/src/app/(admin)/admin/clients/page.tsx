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
import { InviteClientButton } from "./_components/InviteClientButton";
import { ClientsTable } from "./_components/ClientsTable";
import { listStudios } from "@/lib/studio-registry";

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
  // Studio registry (DB-backed) feeds the invite modal's studio
  // dropdown + multi-select so newly-created studios show up without
  // a redeploy.
  const allStudios = await listStudios();
  // Scoped admins only see options for the studios they own.
  const studioOptions =
    scope.studios === null
      ? allStudios
      : allStudios.filter((s) => scope.studios!.includes(s.slug));
  const seen = new Set(stored.map((u) => u.email.toLowerCase()));

  const allClients = [
    ...stored.filter((u) => u.role === "client"),
    ...mockUsers.filter(
      (u) => u.role === "client" && !seen.has(u.email.toLowerCase()),
    ),
  ];

  const visibleClients = allClients
    .filter((c) => !scope.excludedClientEmails.has(c.email.toLowerCase()))
    .filter((c) => {
      // Scoped admin / editor with studios: client must have a home
      // studio in scope. Clients with no homeStudio set fall back to
      // visibility only for super-admins / editors with assigned-client
      // overrides. assignedClientEmails always win.
      if (scope.studios === null) return true;
      if (scope.assignedClientEmails.has(c.email.toLowerCase())) return true;
      const cs = (c as { homeStudio?: string | null }).homeStudio;
      return !!cs && scope.studios!.includes(cs);
    });

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
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="display text-[36px]">Clients</h1>
          <p className="text-text-muted text-[13px] mt-1">
            {rows.length} client{rows.length === 1 ? "" : "s"} with real footage in B2.
          </p>
        </div>
        {user.role === "admin" ? (
          <InviteClientButton
            studios={studioOptions.map((s) => ({
              slug: s.slug,
              displayName: s.displayName,
            }))}
          />
        ) : null}
      </div>

      <ClientsTable
        rows={rows.map((c) => ({
          id: c.id,
          email: c.email,
          firstName: c.firstName,
          lastName: c.lastName,
          avatar: c.avatar,
          avatarColor: c.avatarColor,
          planLabel: PLAN_LIMITS[c.plan]?.label ?? c.plan,
          planKey: c.plan,
          sessionCount: c.sessionCount,
          totalFiles: c.totalFiles,
          totalSize: c.totalSize,
          lastSession: c.lastSession,
        }))}
      />
    </>
  );
}
