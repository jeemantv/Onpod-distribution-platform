"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Logo } from "@/components/Logo";

export default function ResetPage() {
  return (
    <Suspense fallback={null}>
      <ResetPageInner />
    </Suspense>
  );
}

function ResetPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  return token ? <ConfirmForm token={token} router={router} /> : <RequestForm />;
}

function RequestForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/reset-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || "Could not send reset email.");
        setBusy(false);
        return;
      }
      setSent(true);
      setBusy(false);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-10">
          <Logo size={28} />
        </div>
        <div className="bg-bg-elev border border-border rounded-xl p-8 shadow-float">
          <h1 className="display text-[28px] mb-2">Reset password</h1>
          <p className="text-text-muted text-[13px] mb-6">
            We&apos;ll email you a link to set a new password.
          </p>

          {sent ? (
            <p className="text-[13px] text-success">
              If an account exists for that email, we&apos;ve sent a reset link. Check your inbox.
            </p>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-3">
              <label className="text-[12px] text-text-muted" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-bg-elev-2 border border-border rounded-[12px] text-text placeholder:text-text-dim focus:outline-none focus:border-border-strong text-[14px]"
              />
              <button
                type="submit"
                disabled={busy}
                className="mt-3 w-full px-4 py-3 rounded-[12px] bg-accent hover:opacity-90 disabled:opacity-50 text-white font-medium text-[14px]"
              >
                {busy ? "Sending…" : "Send reset link"}
              </button>
            </form>
          )}

          {error ? <p className="mt-4 text-[12px] text-danger">{error}</p> : null}

          <div className="mt-5 text-[12px] text-text-muted">
            <Link href="/login" className="underline hover:text-text">
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

function ConfirmForm({ token, router }: { token: string; router: ReturnType<typeof useRouter> }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/reset-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Could not reset password.");
        setBusy(false);
        return;
      }
      router.push("/account");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-10">
          <Logo size={28} />
        </div>
        <div className="bg-bg-elev border border-border rounded-xl p-8 shadow-float">
          <h1 className="display text-[28px] mb-2">Set a new password</h1>
          <p className="text-text-muted text-[13px] mb-6">
            Pick at least 8 characters.
          </p>

          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <label className="text-[12px] text-text-muted" htmlFor="password">
              New password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-bg-elev-2 border border-border rounded-[12px] text-text placeholder:text-text-dim focus:outline-none focus:border-border-strong text-[14px]"
            />
            <button
              type="submit"
              disabled={busy}
              className="mt-3 w-full px-4 py-3 rounded-[12px] bg-accent hover:opacity-90 disabled:opacity-50 text-white font-medium text-[14px]"
            >
              {busy ? "Saving…" : "Save password"}
            </button>
          </form>

          {error ? <p className="mt-4 text-[12px] text-danger">{error}</p> : null}
        </div>
      </div>
    </main>
  );
}
