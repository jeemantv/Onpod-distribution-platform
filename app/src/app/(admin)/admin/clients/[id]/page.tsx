import Link from "next/link";
import { notFound } from "next/navigation";
import { requireEditorOrAdmin } from "@/lib/session";
import { getUserById } from "@/lib/auth-store";
import { listClientSessions } from "@/lib/studio-store";
import { STUDIO_LABEL } from "@/lib/studio";
import { listStudios } from "@/lib/studio-registry";
import { PlanSelector } from "./_components/PlanSelector";
import { WorkspaceSettings } from "./_components/WorkspaceSettings";
import { StartClientSessionButton } from "./_components/StartClientSessionButton";

export const dynamic = "force-dynamic";

function fmtBytes(n: number): string {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default async function AdminClientDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const user = requireEditorOrAdmin();
  const client = await getUserById(params.id);
  if (!client || client.role !== "client") notFound();

  // Scope gate — scoped admin can only open their own clients. A 404
  // (not 403) so the URL doesn't reveal that some other admin has this
  // client.
  const { loadEditorScope } = await import("@/lib/editor-access");
  const scope = await loadEditorScope(user);
  if (
    scope.studios !== null &&
    !scope.assignedClientEmails.has(client.email.toLowerCase())
  ) {
    const cs = client.homeStudio;
    if (!cs || !scope.studios.includes(cs)) notFound();
  }

  const sessions = await listClientSessions(client.email).catch(() => []);
  const totalSize = sessions.reduce((acc, s) => acc + s.sizeBytes, 0);
  const totalFiles = sessions.reduce((acc, s) => acc + s.fileCount, 0);

  return (
    <>
      <div className="mb-2 text-[12px] text-text-muted">
        <Link href="/admin/clients" className="hover:text-text underline">
          Clients
        </Link>{" "}
        / <span className="text-text">{client.firstName} {client.lastName}</span>
      </div>

      <div className="flex items-center gap-4 mt-2 mb-8">
        <div
          className="w-14 h-14 rounded-full flex items-center justify-center font-semibold"
          style={{ background: client.avatarColor }}
        >
          {client.avatar}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="display text-[32px]">
            {client.firstName} {client.lastName}
          </h1>
          <p className="text-text-muted text-[13px]">{client.email}</p>
          {client.assignedEditorEmail ? (
            <p className="text-[11px] text-text-dim mt-1">
              Assigned editor: {client.assignedEditorEmail}
            </p>
          ) : null}
        </div>
        {user.role === "admin" || (user.role as string) === "editor" ? (
          <StartClientSessionButton
            homeStudio={client.homeStudio ?? "externals"}
            email={client.email}
          />
        ) : null}
      </div>

      <section className="mb-6 p-6 rounded-[16px] bg-bg-elev border border-border">
        <h2 className="display text-[18px] mb-4">Plan</h2>
        {user.role === "admin" ? (
          <PlanSelector clientId={client.id} currentPlan={client.plan} />
        ) : (
          <p className="text-[13px] text-text-muted">
            Current plan: {client.plan}. Only admins can change plans.
          </p>
        )}
      </section>

      <section className="mb-6 p-6 rounded-[16px] bg-bg-elev border border-border">
        <h2 className="display text-[18px] mb-4">Workspace</h2>
        {user.role === "admin" ? (
          <WorkspaceSettings
            clientId={client.id}
            currentHomeStudio={client.homeStudio ?? null}
            currentSelfUpload={client.selfUploadEnabled ?? false}
            studios={(
              scope.studios === null
                ? await listStudios()
                : (await listStudios()).filter((s) => scope.studios!.includes(s.slug))
            ).map((s) => ({ slug: s.slug, displayName: s.displayName }))}
          />
        ) : (
          <p className="text-[13px] text-text-muted">
            Home studio: {client.homeStudio ?? "—"}. Only admins can change workspace
            settings.
          </p>
        )}
      </section>

      <section className="mb-8 p-6 rounded-[16px] bg-bg-elev border border-border">
        <h2 className="display text-[18px] mb-4">Footage summary</h2>
        <div className="grid grid-cols-3 gap-3 text-[12px]">
          <Stat label="Sessions" value={String(sessions.length)} />
          <Stat label="Files" value={String(totalFiles)} />
          <Stat label="Storage" value={fmtBytes(totalSize)} />
        </div>
      </section>

      <section>
        <h2 className="display text-[20px] mb-4">Sessions</h2>
        {sessions.length === 0 ? (
          <div className="bg-bg-elev border border-border rounded-lg p-12 text-center">
            <p className="text-text-muted text-[13px]">
              No sessions found for {client.email}.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {sessions.map((s) => (
              <li key={`${s.studio}/${s.folder}`}>
                <Link
                  href={`/admin/studios/${s.studio}/clients/${encodeURIComponent(s.folder)}`}
                  className="group flex items-center gap-4 px-5 py-4 bg-bg-elev border border-border rounded-lg hover:border-border-strong hover:bg-bg-elev-2 transition"
                >
                  <div className="w-10 h-10 rounded-md bg-bg-elev-3 flex items-center justify-center text-text-muted shrink-0">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[14px]">
                      {s.parsed ? `${s.parsed.date} ${s.parsed.time}` : s.folder}{" "}
                      — {STUDIO_LABEL[s.studio]}
                    </div>
                    <p className="text-[11px] text-text-muted mt-1">
                      {s.fileCount} files · {fmtBytes(s.sizeBytes)}
                      {s.lastModified ? (
                        <> · {new Date(s.lastModified).toLocaleDateString()}</>
                      ) : null}
                    </p>
                  </div>
                  <span className="text-text-dim group-hover:text-text shrink-0">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] bg-bg-elev-2 border border-border px-4 py-3">
      <div className="text-[11px] text-text-muted">{label}</div>
      <div className="display text-[20px] mt-0.5">{value}</div>
    </div>
  );
}
