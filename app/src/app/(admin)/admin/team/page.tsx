import { requireEditorOrAdmin } from "@/lib/session";
import { listAllUsers } from "@/lib/auth-store";
import { TeamTable } from "@/components/TeamTable";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const user = requireEditorOrAdmin();
  const users = await listAllUsers();
  const clients = users
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
            ? "Add team members, assign editors to studios, and exclude specific clients."
            : "Editors see the team list. Only admins can change roles."}
        </p>
      </div>
      <TeamTable
        currentUserId={user.id}
        canChangeRoles={user.role === "admin"}
        allClients={clients}
        users={users.map((u) => ({
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
        }))}
      />
    </>
  );
}
