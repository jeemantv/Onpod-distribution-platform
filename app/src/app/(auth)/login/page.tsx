"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Logo } from "@/components/Logo";

// useSearchParams() forces Next to skip static prerender; wrapping in
// Suspense satisfies the framework rule and keeps the build clean.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const search = useSearchParams();
  const magicError = search.get("magic");

  const [mode, setMode] = useState<"magic" | "password">("magic");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [magicSent, setMagicSent] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);

  async function onSubmitPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Sign in failed.");
        setBusy(false);
        return;
      }
      const role = data.user?.role;
      router.push(role === "admin" || role === "editor" ? "/admin/clients" : "/account");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function onSubmitMagic(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMagicSent(null);
    setDevLink(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/magic/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json().catch(() => ({}));
      // Always show the success message — we intentionally don't leak
      // whether the email exists.
      setMagicSent(email);
      if (data.devLink) setDevLink(data.devLink);
    } catch (err) {
      setError((err as Error).message);
    } finally {
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
          <h1 className="display text-[32px] mb-2">Sign in</h1>
          <p className="text-text-muted text-[13px] mb-6">
            {mode === "magic"
              ? "Get a one-time link in your inbox — no password needed."
              : "Use your OnPod credentials."}
          </p>

          {magicError ? (
            <div className="mb-4 p-3 rounded-[10px] bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-[12px] text-[#f87171]">
              {magicError === "expired"
                ? "That link expired. Request a new one below."
                : magicError === "missing_user"
                  ? "That account was removed. Ask an admin to re-invite you."
                  : "That sign-in link wasn't valid. Try requesting a new one."}
            </div>
          ) : null}

          {magicSent ? (
            <div className="mb-4 p-3 rounded-[10px] bg-[rgba(16,185,129,0.1)] border border-[rgba(16,185,129,0.3)] text-[12px] text-[#34d399]">
              Sent. Check the inbox for <code className="text-text">{magicSent}</code> — the link works once and expires in 30 minutes.
              {devLink ? (
                <div className="mt-2 text-text-muted">
                  Dev mode (no Resend key): <a href={devLink} className="text-accent-2 underline break-all">{devLink}</a>
                </div>
              ) : null}
            </div>
          ) : null}

          {mode === "magic" ? (
            <form onSubmit={onSubmitMagic} className="flex flex-col gap-3">
              <label className="text-[12px] text-text-muted" htmlFor="email">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@studio.com"
                className="w-full px-4 py-3 bg-bg-elev-2 border border-border rounded-[12px] text-text placeholder:text-text-dim focus:outline-none focus:border-border-strong text-[14px]"
              />
              <button
                type="submit"
                disabled={busy || !email.trim()}
                className="mt-3 w-full px-4 py-3 rounded-[12px] bg-accent hover:opacity-90 disabled:opacity-50 text-white font-medium text-[14px]"
              >
                {busy ? "Sending…" : "Email me a sign-in link"}
              </button>
            </form>
          ) : (
            <form onSubmit={onSubmitPassword} className="flex flex-col gap-3">
              <label className="text-[12px] text-text-muted" htmlFor="email">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@studio.com"
                className="w-full px-4 py-3 bg-bg-elev-2 border border-border rounded-[12px] text-text placeholder:text-text-dim focus:outline-none focus:border-border-strong text-[14px]"
              />
              <label className="text-[12px] text-text-muted mt-2" htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 bg-bg-elev-2 border border-border rounded-[12px] text-text placeholder:text-text-dim focus:outline-none focus:border-border-strong text-[14px]"
              />
              <button
                type="submit"
                disabled={busy}
                className="mt-3 w-full px-4 py-3 rounded-[12px] bg-accent hover:opacity-90 disabled:opacity-50 text-white font-medium text-[14px]"
              >
                {busy ? "Signing in…" : "Sign in"}
              </button>
            </form>
          )}

          {error ? <p className="mt-4 text-[12px] text-danger">{error}</p> : null}

          <div className="mt-5 flex items-center justify-between text-[12px]">
            <button
              type="button"
              onClick={() => setMode(mode === "magic" ? "password" : "magic")}
              className="text-text-muted hover:text-text underline"
            >
              {mode === "magic" ? "Sign in with password" : "Use magic link instead"}
            </button>
            <Link href="/reset" className="text-text-muted hover:text-text underline">
              Forgot password?
            </Link>
          </div>

          <div className="mt-6 pt-6 border-t border-border text-[12px] text-text-muted">
            <p className="mb-2 font-medium text-text">Demo accounts (password: <code className="text-accent-2">demo</code>):</p>
            <ul className="space-y-1">
              <li><code className="text-accent-2">admin@onpod.io</code> — admin</li>
              <li><code className="text-accent-2">editor@onpod.io</code> — editor</li>
              <li><code className="text-accent-2">client@onpod.io</code> — client</li>
            </ul>
          </div>
        </div>

        <p className="text-center text-[11px] text-text-dim mt-6">
          Need a studio account?{" "}
          <Link href="https://onpod.io" className="underline">
            Contact OnPod Studios
          </Link>
        </p>
      </div>
    </main>
  );
}
