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
  assignedStudios?: string[];
  excludedClientEmails?: string[];
}

const ROLE_OPTIONS = ["client", "editor", "admin"] as const;
// Pulled from lib/studio so adding a new workspace (e.g. externals)
// flows through to the editor-assignment dropdown automatically.
import { STUDIO_SLUGS, STUDIO_LABEL as STUDIO_LABEL_LIVE } from "@/lib/studio";
const STUDIO_LABEL: Record<string, string> = STUDIO_LABEL_LIVE;

export function TeamTable({
  users,
  canChangeRoles,
  currentUserId,
  canDelete = false,
  allClients = [],
  availableStudios,
}: {
  users: UserRow[];
  canChangeRoles: boolean;
  currentUserId: string;
  canDelete?: boolean;
  allClients?: { email: string; name: string }[];
  // DB-backed studio list — when present, replaces the static
  // STUDIO_SLUGS/STUDIO_LABEL constants so dynamic studios show up in
  // the assignment grid.
  availableStudios?: { slug: string; displayName: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [assignFor, setAssignFor] = useState<UserRow | null>(null);

  async function deleteMember(u: UserRow) {
    if (!confirm(`Remove ${u.firstName} ${u.lastName} (${u.email})?`)) return;
    setBusy(u.id);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (!res.ok) {
        alert(data.message || `Failed (${res.status})`);
        setBusy(null);
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

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

  function describeAssignment(u: UserRow): string {
    if (u.role !== "editor") return "—";
    const studios = u.assignedStudios ?? [];
    if (studios.length === 0) return "No studios";
    if (studios.includes("all")) {
      const excluded = u.excludedClientEmails?.length ?? 0;
      return excluded
        ? `All studios · ${excluded} excluded`
        : "All studios";
    }
    return studios
      .map((s) => availableStudios?.find((opt) => opt.slug === s)?.displayName ?? STUDIO_LABEL[s] ?? s)
      .join(", ");
  }

  return (
    <>
      {canChangeRoles ? (
        <div className="mb-4 flex justify-end">
          <button
            onClick={() => setShowInvite(true)}
            className="px-4 py-2 rounded-[10px] bg-accent text-white text-[13px]"
          >
            + Add team member
          </button>
        </div>
      ) : null}

      <div className="bg-bg-elev border border-border rounded-[16px] overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-text-muted text-[11px] uppercase tracking-wider border-b border-border">
              <th className="text-left p-4 font-medium">Member</th>
              <th className="text-left p-4 font-medium">Role</th>
              <th className="text-left p-4 font-medium">Assigned</th>
              <th className="text-left p-4 font-medium">Joined</th>
              {canChangeRoles ? (
                <th className="text-right p-4 font-medium">Actions</th>
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
                <td className="p-4 text-text-muted text-[12px]">
                  {describeAssignment(u)}
                </td>
                <td className="p-4 text-text-muted">
                  {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                </td>
                {canChangeRoles ? (
                  <td className="p-4">
                    <div className="flex items-center gap-2 justify-end">
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
                      {u.role === "editor" ? (
                        <button
                          onClick={() => setAssignFor(u)}
                          className="px-3 py-1.5 rounded-[8px] bg-bg-elev-3 border border-border text-[12px]"
                        >
                          Manage
                        </button>
                      ) : null}
                      {canDelete && u.id !== currentUserId ? (
                        <button
                          onClick={() => deleteMember(u)}
                          disabled={busy === u.id}
                          className="px-3 py-1.5 rounded-[8px] bg-bg-elev-3 border border-border text-[12px] text-danger disabled:opacity-50"
                          title="Remove this team member"
                        >
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showInvite ? (
        <InviteModal onClose={() => setShowInvite(false)} onCreated={() => router.refresh()} />
      ) : null}

      {assignFor ? (
        <AssignmentModal
          user={assignFor}
          allClients={allClients}
          availableStudios={availableStudios}
          onClose={() => setAssignFor(null)}
          onSaved={() => {
            setAssignFor(null);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

function InviteModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"editor" | "admin" | "client">("editor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/invite-team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          role,
          temporaryPassword: password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || `Failed (${res.status})`);
        setBusy(false);
        return;
      }
      onCreated();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div
        className="bg-bg-elev border border-border rounded-[14px] w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[18px] font-semibold mb-3">Add team member</h3>
        <p className="text-[12px] text-text-muted mb-4">
          Creates the account directly. Pass the temporary password to the
          person, or have them use &quot;Forgot password&quot; afterwards.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" value={firstName} onChange={setFirstName} />
          <Field label="Last name" value={lastName} onChange={setLastName} />
        </div>
        <Field label="Email" type="email" value={email} onChange={setEmail} />
        <Field
          label="Temporary password"
          type="password"
          value={password}
          onChange={setPassword}
          hint="Min 8 characters"
        />
        <label className="block text-[11px] text-text-muted mt-3">
          Role
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
            className="mt-1 w-full px-3 py-2 bg-bg-elev-2 border border-border rounded-[10px] text-[13px]"
          >
            <option value="editor">Editor</option>
            <option value="admin">Admin</option>
            <option value="client">Client</option>
          </select>
        </label>
        {error ? (
          <p className="text-[12px] text-danger mt-3">{error}</p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-[8px] bg-bg-elev-3 border border-border text-[12px]"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !email || !firstName || !lastName || password.length < 8}
            className="px-3 py-1.5 rounded-[8px] bg-accent text-white text-[12px] disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AssignmentModal({
  user,
  allClients,
  onClose,
  onSaved,
  availableStudios,
}: {
  user: UserRow;
  allClients: { email: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
  availableStudios?: { slug: string; displayName: string }[];
}) {
  const initialStudios = user.assignedStudios ?? [];
  const initialAll = initialStudios.includes("all");
  const [allStudios, setAllStudios] = useState(initialAll);
  const [studios, setStudios] = useState<string[]>(
    initialAll ? [] : initialStudios,
  );
  const [excluded, setExcluded] = useState<string[]>(
    (user.excludedClientEmails ?? []).map((e) => e.toLowerCase()),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleStudio(slug: string) {
    setStudios((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  }
  function toggleExcluded(email: string) {
    const e = email.toLowerCase();
    setExcluded((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]));
  }

  async function assignAllClients() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/editors/${user.id}/assign-all-clients`,
        { method: "POST" },
      );
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (!res.ok) {
        setError(data.message || `Failed (${res.status})`);
        setBusy(false);
        return;
      }
      alert(
        `${data.count ?? 0} client(s) now route their review requests to ${data.email ?? user.email}.`,
      );
      setBusy(false);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const assignedStudios = allStudios ? ["all"] : studios;
      const res = await fetch(`/api/admin/users/${user.id}/assignment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignedStudios,
          excludedClientEmails: excluded,
        }),
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (!res.ok) {
        setError(data.message || `Failed (${res.status})`);
        setBusy(false);
        return;
      }
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div
        className="bg-bg-elev border border-border rounded-[14px] w-full max-w-lg p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[18px] font-semibold mb-1">
          Assign {user.firstName} {user.lastName}
        </h3>
        <p className="text-[12px] text-text-muted mb-4">{user.email}</p>

        <div className="mb-4">
          <div className="text-[11px] uppercase tracking-wider text-text-dim mb-2">
            Studios
          </div>
          <label className="flex items-center gap-2 text-[13px] mb-2">
            <input
              type="checkbox"
              checked={allStudios}
              onChange={(e) => setAllStudios(e.target.checked)}
            />
            All studios
          </label>
          {!allStudios ? (
            <div className="grid grid-cols-2 gap-2">
              {(availableStudios ?? STUDIO_SLUGS.map((s) => ({ slug: s, displayName: STUDIO_LABEL[s] ?? s }))).map((s) => (
                <label
                  key={s.slug}
                  className="flex items-center gap-2 px-3 py-2 bg-bg-elev-2 border border-border rounded-[8px] text-[13px]"
                >
                  <input
                    type="checkbox"
                    checked={studios.includes(s.slug)}
                    onChange={() => toggleStudio(s.slug)}
                  />
                  {s.displayName}
                </label>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mb-4 p-3 rounded-[10px] bg-bg-elev-2 border border-border">
          <div className="text-[11px] uppercase tracking-wider text-text-dim mb-2">
            Route review requests
          </div>
          <p className="text-[12px] text-text-muted mb-2">
            Sets every client&apos;s assigned editor to {user.email}. Any
            existing per-client assignments are overwritten. Use this when
            you want one editor to handle every review request.
          </p>
          <button
            onClick={assignAllClients}
            disabled={busy}
            className="px-3 py-1.5 rounded-[8px] bg-bg-elev-3 border border-border text-[12px] disabled:opacity-50"
          >
            {busy ? "Working…" : "Assign to all clients"}
          </button>
        </div>

        <div className="mb-3">
          <div className="text-[11px] uppercase tracking-wider text-text-dim mb-2">
            Excluded clients
            <span className="text-text-dim ml-2 normal-case">
              (the editor won&apos;t see sessions belonging to these emails)
            </span>
          </div>
          {allClients.length === 0 ? (
            <p className="text-[12px] text-text-muted">
              No client accounts yet — exclusions can be added once clients sign up.
            </p>
          ) : (
            <div className="max-h-48 overflow-y-auto border border-border rounded-[8px] divide-y divide-border">
              {allClients.map((c) => (
                <label
                  key={c.email}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-[13px] hover:bg-bg-elev-2"
                >
                  <span>
                    {c.name}{" "}
                    <span className="text-text-muted text-[11px]">{c.email}</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={excluded.includes(c.email.toLowerCase())}
                    onChange={() => toggleExcluded(c.email)}
                  />
                </label>
              ))}
            </div>
          )}
        </div>

        {error ? (
          <p className="text-[12px] text-danger mt-3">{error}</p>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-[8px] bg-bg-elev-3 border border-border text-[12px]"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="px-3 py-1.5 rounded-[8px] bg-accent text-white text-[12px] disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  hint?: string;
}) {
  return (
    <label className="block text-[11px] text-text-muted mt-3">
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full px-3 py-2 bg-bg-elev-2 border border-border rounded-[10px] text-[13px]"
      />
      {hint ? <span className="block text-text-dim text-[10px] mt-1">{hint}</span> : null}
    </label>
  );
}
