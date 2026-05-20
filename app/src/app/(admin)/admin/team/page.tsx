import { requireEditorOrAdmin } from "@/lib/session";
import { listAllUsers } from "@/lib/auth-store";
import { mockUsers } from "@/lib/mock-data";
import { TeamTable } from "@/components/TeamTable";

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
  const stored = await listAllUsers();
  // Merge B2-backed users with demo mock users so admins can see the
  // whole team in one place. Demo users get a flag so the UI can warn
  // that role/assignment changes won't persist (the mutation endpoints
  // only write to the B2 store).
  const seen = new Set(stored.map((u) => u.email.toLowerCase()));
  const merged: Row[] = [
    ...stored.map((u) => ({
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role as string,
      avatar: u.avatar,
      avatarColor: u.avatarColor,
      createdAt: u.createdAt,
      assignedStudios: u.assignedStudios,
      excludedClientEmails: u.excludedClientEmails,
    })),
    ...mockUsers
      .filter((u) => !seen.has(u.email.toLowerCase()))
      .map((u) => ({
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role as string,
        avatar: u.avatar,
        avatarColor: u.avatarColor,
        createdAt: u.createdAt,
        // Demo editors implicitly have all studios via editor-access
        assignedStudios:
          u.role === "editor" ? ["all"] : undefined,
        excludedClientEmails: undefined,
        isDemo: true,
      })),
  ];

  const clients = merged
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
        users={merged}
      />
    </>
  );
}
