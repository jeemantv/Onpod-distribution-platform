"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface UserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  avatar: string;
  avatarColor: string;
  createdAt: string;
}

const ROLE_OPTIONS = ["client", "editor", "admin"] as const;

export function TeamTable({
  users,
  canChangeRoles,
  currentUserId,
}: {
  users: UserRow[];
  canChangeRoles: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function setRole(id: string, role: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/users/${id}/role`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.message || "Update failed.");
        setBusy(null);
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="bg-bg-elev border border-border rounded-[16px] overflow-hidden">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-text-muted text-[11px] uppercase tracking-wider border-b border-border">
            <th className="text-left p-4 font-medium">Member</th>
            <th className="text-left p-4 font-medium">Role</th>
            <th className="text-left p-4 font-medium">Joined</th>
            {canChangeRoles ? (
              <th className="text-right p-4 font-medium">Set role</th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-border last:border-0">
              <td className="p-4">
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center font-semibold text-[12px]"
                    style={{ background: u.avatarColor }}
                  >
                    {u.avatar}
                  </div>
                  <div>
                    <div className="font-medium">
                      {u.firstName} {u.lastName}
                      {u.id === currentUserId ? (
                        <span className="ml-2 text-text-dim text-[11px]">(you)</span>
                      ) : null}
                    </div>
                    <div className="text-text-muted text-[11px]">{u.email}</div>
                  </div>
                </div>
              </td>
              <td className="p-4">
                <span className="inline-block px-2.5 py-1 rounded-full bg-bg-elev-3 border border-border text-[11px] capitalize">
                  {u.role}
                </span>
              </td>
              <td className="p-4 text-text-muted">
                {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
              </td>
              {canChangeRoles ? (
                <td className="p-4 text-right">
                  <select
                    value={u.role}
                    disabled={busy === u.id || u.id === currentUserId}
                    onChange={(e) => void setRole(u.id, e.target.value)}
                    className="px-2 py-1.5 rounded-[8px] bg-bg-elev-3 border border-border text-[12px] disabled:opacity-50"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
