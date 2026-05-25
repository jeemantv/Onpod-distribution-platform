"use client";

import { useState } from "react";

export function InviteAcceptForm({
  token,
  studioName,
  paymentLinkUrl,
}: {
  token: string;
  studioName: string;
  paymentLinkUrl: string | null;
}) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ devLink?: string; sent: boolean } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/invite/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { message?: string }).message ?? `HTTP ${res.status}`);
      }
      setSuccess({ sent: data.sent ?? false, devLink: data.devLink });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (success) {
    return (
      <div className="space-y-4">
        <div className="p-3 rounded-[10px] bg-[rgba(16,185,129,0.1)] border border-[rgba(16,185,129,0.3)] text-[13px] text-[#34d399]">
          {success.sent
            ? `Sign-in link sent to ${email}. Open it from your inbox to access ${studioName}.`
            : `Account created for ${email}. Sign-in link below — copy it now.`}
        </div>
        {success.devLink ? (
          <div className="p-3 rounded-[10px] bg-bg-elev-2 border border-border">
            <div className="text-[11px] text-text-muted mb-1">
              Dev mode (no Resend domain verified):
            </div>
            <a
              href={success.devLink}
              className="text-[12px] text-accent-2 underline break-all font-mono"
            >
              {success.devLink}
            </a>
          </div>
        ) : null}
        {paymentLinkUrl ? (
          <div className="p-4 rounded-[10px] bg-bg-elev-2 border border-border">
            <p className="text-[13px] font-medium mb-2">Next step: set up payment</p>
            <p className="text-[12px] text-text-muted mb-3">
              {studioName} requires a paid plan to use AI / publishing tools. Set
              up your subscription before your first session.
            </p>
            <a
              href={paymentLinkUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-block px-4 py-2 rounded-[10px] bg-accent text-white text-[13px] font-medium"
            >
              Set up payment →
            </a>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="text-[12px] text-text-muted">Email *</label>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="w-full px-4 py-3 bg-bg-elev-2 border border-border rounded-[12px] text-text placeholder:text-text-dim focus:outline-none focus:border-border-strong text-[14px]"
      />
      <div className="grid grid-cols-2 gap-3">
        <input
          type="text"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="First name"
          className="w-full px-4 py-3 bg-bg-elev-2 border border-border rounded-[12px] text-[14px]"
        />
        <input
          type="text"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          placeholder="Last name"
          className="w-full px-4 py-3 bg-bg-elev-2 border border-border rounded-[12px] text-[14px]"
        />
      </div>
      <button
        type="submit"
        disabled={busy || !email.trim()}
        className="mt-3 w-full px-4 py-3 rounded-[12px] bg-accent text-white font-medium text-[14px] disabled:opacity-50"
      >
        {busy ? "Creating account…" : "Get my sign-in link"}
      </button>
      {error ? <p className="text-[12px] text-danger">{error}</p> : null}
    </form>
  );
}
