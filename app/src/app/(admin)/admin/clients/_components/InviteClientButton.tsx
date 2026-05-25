"use client";

// Header button on /admin/clients that opens an invite modal. POSTs to
// /api/admin/clients/invite — that route handles user creation + magic
// link issuance + email send (or returns devLink in dev mode).

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal } from "@/components/Modal";

interface StudioOption {
  slug: string;
  displayName: string;
}

interface InviteResult {
  ok: boolean;
  userId?: string;
  created?: boolean;
  sent?: boolean;
  sendError?: string;
  devLink?: string;
  expiresAt?: string;
}

export function InviteClientButton({ studios }: { studios: StudioOption[] }) {
  const router = useRouter();
  // Use the DB-backed list passed from the server. Falls back to a
  // single "externals" entry if the page somehow forgot to pass it.
  const opts: StudioOption[] = studios.length
    ? studios
    : [{ slug: "externals", displayName: "Externals" }];
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<"client" | "editor" | "admin">("client");
  const [homeStudio, setHomeStudio] = useState<string>("externals");
  const [selfUploadEnabled, setSelfUploadEnabled] = useState(true);
  // For editor + admin invites — which studios they can see.
  const [assignedStudios, setAssignedStudios] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<InviteResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setEmail("");
    setFirstName("");
    setLastName("");
    setRole("client");
    setHomeStudio("externals");
    setSelfUploadEnabled(true);
    setAssignedStudios([]);
    setResult(null);
    setError(null);
  };

  const close = () => {
    setOpen(false);
    // Slight delay so the closing animation doesn't show a flicker of
    // reset state.
    setTimeout(reset, 200);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/clients/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          role,
          homeStudio: role === "client" ? homeStudio : undefined,
          selfUploadEnabled: role === "client" ? selfUploadEnabled : undefined,
          assignedStudios:
            role === "editor" || role === "admin" ? assignedStudios : undefined,
        }),
      });
      const text = await res.text();
      let data: InviteResult & { error?: string; message?: string } = { ok: false };
      try {
        data = text ? JSON.parse(text) : { ok: false };
      } catch {
        /* leave as fallback */
      }
      if (!res.ok) {
        throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`);
      }
      setResult(data);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 rounded-[10px] bg-accent text-white text-[13px] font-medium hover:opacity-90"
      >
        + Invite client
      </button>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 rounded-[10px] bg-accent text-white text-[13px] font-medium hover:opacity-90"
      >
        + Invite client
      </button>
      <Modal
        title="Invite a new client"
        subtitle="Creates the user and emails them a one-time sign-in link."
        onClose={close}
        size="md"
        footer={
          <>
            <button
              onClick={close}
              className="px-4 py-2 text-text-muted hover:text-text"
            >
              {result ? "Close" : "Cancel"}
            </button>
            {!result ? (
              <button
                onClick={submit}
                disabled={busy || !email.trim().includes("@")}
                className="px-5 py-2.5 rounded-[10px] bg-accent text-white text-[13px] font-medium disabled:opacity-50"
              >
                {busy ? "Sending…" : "Send invite"}
              </button>
            ) : (
              <button
                onClick={reset}
                className="px-5 py-2.5 rounded-[10px] bg-bg-elev-3 border border-border-strong text-[13px]"
              >
                Invite another
              </button>
            )}
          </>
        }
      >
        {result ? (
          <div className="space-y-3">
            <div className="p-3 rounded-[10px] bg-[rgba(16,185,129,0.1)] border border-[rgba(16,185,129,0.3)] text-[13px] text-[#34d399]">
              {result.created ? "Created" : "Updated"} <code className="text-text">{email}</code>.
              {result.sent ? " Magic-link email sent." : null}
            </div>
            {result.sendError ? (
              <div className="p-3 rounded-[10px] bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.3)] text-[12px] text-[#fbbf24]">
                Email could not be sent: {result.sendError}
              </div>
            ) : null}
            {result.devLink ? (
              <div className="p-3 rounded-[10px] bg-bg-elev-2 border border-border">
                <div className="text-[11px] text-text-muted mb-1">
                  Dev mode (no Resend domain verified): copy this link to the client manually.
                </div>
                <a
                  href={result.devLink}
                  className="text-[12px] text-accent-2 underline break-all font-mono"
                >
                  {result.devLink}
                </a>
              </div>
            ) : null}
            {result.expiresAt ? (
              <p className="text-[11px] text-text-dim">
                Link expires {new Date(result.expiresAt).toLocaleString()}.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-[12px] text-text-muted mb-1">Email *</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="client@example.com"
                autoFocus
                className="w-full px-3 py-2 bg-bg-elev-2 border border-border rounded-[10px] text-[13px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] text-text-muted mb-1">First name</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full px-3 py-2 bg-bg-elev-2 border border-border rounded-[10px] text-[13px]"
                />
              </div>
              <div>
                <label className="block text-[12px] text-text-muted mb-1">Last name</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full px-3 py-2 bg-bg-elev-2 border border-border rounded-[10px] text-[13px]"
                />
              </div>
            </div>
            <div>
              <label className="block text-[12px] text-text-muted mb-1">Role</label>
              <div className="inline-flex border border-border rounded-[8px] overflow-hidden text-[13px]">
                {(["client", "editor", "admin"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={
                      role === r
                        ? "px-4 py-1.5 bg-bg-elev-3 text-text font-medium"
                        : "px-4 py-1.5 bg-bg-elev text-text-muted hover:text-text"
                    }
                  >
                    {r}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-text-dim mt-1">
                Clients see their own sessions. Editors + admins see the studios
                assigned to them — admins with no studios are super-admins (see all).
              </p>
            </div>

            {role === "client" ? (
              <>
                <div>
                  <label className="block text-[12px] text-text-muted mb-1">
                    Home studio (workspace)
                  </label>
                  <select
                    value={homeStudio}
                    onChange={(e) => {
                      const next = e.target.value;
                      setHomeStudio(next);
                      // Reasonable default: self-upload on for externals,
                      // off for Pearl-fed OnPod studios (n8n ingests).
                      setSelfUploadEnabled(next === "externals");
                    }}
                    className="w-full px-3 py-2 bg-bg-elev-2 border border-border rounded-[10px] text-[13px]"
                  >
                    {opts.map((s) => (
                      <option key={s.slug} value={s.slug}>
                        {s.displayName}
                        {s.slug === "externals" ? " (default for website signups)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-[13px] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selfUploadEnabled}
                    onChange={(e) => setSelfUploadEnabled(e.target.checked)}
                    className="accent-accent w-4 h-4"
                  />
                  <span>Let this client upload their own videos</span>
                </label>
              </>
            ) : (
              <div>
                <label className="block text-[12px] text-text-muted mb-1">
                  Studios this {role} can see
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {opts.map((s) => {
                    const checked = assignedStudios.includes(s.slug);
                    return (
                      <label
                        key={s.slug}
                        className="flex items-center gap-2 px-3 py-2 border border-border rounded-[8px] text-[13px] cursor-pointer select-none hover:border-border-strong"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setAssignedStudios((prev) =>
                              e.target.checked
                                ? [...prev, s.slug]
                                : prev.filter((x) => x !== s.slug),
                            );
                          }}
                          className="accent-accent w-4 h-4"
                        />
                        <span>{s.displayName}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-[11px] text-text-dim mt-1">
                  {role === "admin"
                    ? assignedStudios.length === 0
                      ? "No studios checked = super-admin (sees all)."
                      : `Scoped to ${assignedStudios.length} studio${assignedStudios.length === 1 ? "" : "s"}.`
                    : assignedStudios.length === 0
                      ? "No studios checked — editor will see nothing. Pick at least one."
                      : `Scoped to ${assignedStudios.length} studio${assignedStudios.length === 1 ? "" : "s"}.`}
                </p>
              </div>
            )}
            {error ? (
              <div className="p-3 rounded-[10px] bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-[12px] text-[#f87171]">
                {error}
              </div>
            ) : null}
          </div>
        )}
      </Modal>
    </>
  );
}
