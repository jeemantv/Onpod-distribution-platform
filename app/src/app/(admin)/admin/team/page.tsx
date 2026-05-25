import { requireEditorOrAdmin } from "@/lib/session";
import { listAllUsers } from "@/lib/auth-store";
import { TeamTable } from "@/components/TeamTable";
import { loadEditorScope } from "@/lib/editor-access";
import { listStudios } from "@/lib/studio-registry";

export const dynamic = "force-dynamic";

interface Row {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  avatar: string;
  avatarColor: string;
  createdAt: string;
  assignedStudios?: string[];
  excludedClientEmails?: string[];
  isDemo?: boolean;
}

export default async function TeamPage() {
  const user = requireEditorOrAdmin();
  const scope = await loadEditorScope(user);
  const stored = await listAllUsers();
  // Scoped admin (assignedStudios set) only sees teammates whose
  // assignedStudios overlap with theirs. Super-admin and editors see all.
  const filterByScope = (u: { role: string; assignedStudios?: string[] }) => {
    if (scope.studios === null) return true;
    // Other super-admins (no assignedStudios) are out of scope.
    if (!u.assignedStudios || u.assignedStudios.length === 0) {
      return u.role === "editor" ? false : false;
    }
    return u.assignedStudios.some((s) => scope.studios!.includes(s));
  };
  // Only admins and editors appear in the Team tab. Clients live under
  // /admin/clients; the `allClients` prop below still lists them so
  // per-editor "excluded clients" dropdowns continue to work.
  const teamRows: Row[] = stored
    .filter((u) => u.role === "admin" || u.role === "editor")
    .filter(filterByScope)
    .map((u) => ({
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
      avatar: u.avatar,
      avatarColor: u.avatarColor,
      createdAt: u.createdAt,
      assignedStudios: u.assignedStudios,
      excludedClientEmails: u.excludedClientEmails,
    }));

  const allClients = stored
    .filter((u) => u.role === "client")
    .map((u) => ({
      email: u.email,
      name: `${u.firstName} ${u.lastName}`.trim() || u.email,
    }));

  return (
    <>
      <div className="mb-8">
        <h1 className="display text-[36px]">Team</h1>
        <p className="text-text-muted text-[13px] mt-1">
          {user.role === "admin"
            ? "Admins and editors only. Manage clients under the Clients tab."
            : "Admins and editors only. Clients live under the Clients tab."}
        </p>
      </div>
      <TeamTable
        currentUserId={user.id}
        canChangeRoles={user.role === "admin"}
        allClients={allClients}
        users={teamRows}
        availableStudios={(await listStudios()).map((s) => ({
          slug: s.slug,
          displayName: s.displayName,
        }))}
      />
    </>
  );
}
