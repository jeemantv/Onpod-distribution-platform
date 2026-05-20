"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/Logo";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
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

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-10">
          <Logo size={28} />
        </div>

        <div className="bg-bg-elev border border-border rounded-xl p-8 shadow-float">
          <h1 className="display text-[32px] mb-2">Sign in</h1>
          <p className="text-text-muted text-[13px] mb-6">
            Use your OnPod credentials.
          </p>

          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <label className="text-[12px] text-text-muted" htmlFor="email">
              Email
            </label>
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

            <label className="text-[12px] text-text-muted mt-2" htmlFor="password">
              Password
            </label>
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

          {error ? (
            <p className="mt-4 text-[12px] text-danger">{error}</p>
          ) : null}

          <div className="mt-5 flex items-center justify-between text-[12px]">
            <Link href="/reset" className="text-text-muted hover:text-text underline">
              Forgot password?
            </Link>
            <Link href="/signup" className="text-text-muted hover:text-text underline">
              Create account
            </Link>
          </div>

          <div className="mt-6 pt-6 border-t border-border text-[12px] text-text-muted">
            <p className="mb-2 font-medium text-text">Demo accounts (password: <code className="text-accent-2">demo</code>):</p>
            <ul className="space-y-1">
              <li><code className="text-accent-2">admin@onpod.io</code> — admin (full access, can delete)</li>
              <li><code className="text-accent-2">editor@onpod.io</code> — video editor (same view as admin, no delete)</li>
              <li><code className="text-accent-2">client@onpod.io</code> — client (sees own sessions only)</li>
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
