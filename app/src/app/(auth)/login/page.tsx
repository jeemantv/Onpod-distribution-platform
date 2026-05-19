import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { signIn } from "@/lib/session";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { sent?: string; error?: string };
}) {
  async function send(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    if (!email) redirect("/login?error=missing");
    const user = signIn(email);
    redirect(user.role === "admin" ? "/admin/clients" : "/account");
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
            We&apos;ll send a magic link to your inbox. No password needed.
          </p>

          <form action={send} className="flex flex-col gap-3">
            <label className="text-[12px] text-text-muted" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="you@studio.com"
              className="w-full px-4 py-3 bg-bg-elev-2 border border-border rounded-[12px] text-text placeholder:text-text-dim focus:outline-none focus:border-border-strong text-[14px]"
            />
            <button
              type="submit"
              className="mt-2 w-full px-4 py-3 rounded-[12px] bg-accent hover:opacity-90 text-white font-medium text-[14px]"
            >
              Send magic link
            </button>
          </form>

          {searchParams.sent ? (
            <p className="mt-4 text-[12px] text-success">
              Check your inbox for the magic link.
            </p>
          ) : null}
          {searchParams.error ? (
            <p className="mt-4 text-[12px] text-danger">
              Enter a valid email.
            </p>
          ) : null}

          <div className="mt-6 pt-6 border-t border-border text-[12px] text-text-muted">
            <p className="mb-2 font-medium text-text">Demo accounts (mock auth):</p>
            <ul className="space-y-1">
              <li><code className="text-accent-2">admin@onpod.io</code> — studio admin</li>
              <li><code className="text-accent-2">marc@example.com</code> — Pro plan client</li>
              <li><code className="text-accent-2">sofia@example.com</code> — Starter plan client</li>
              <li><code className="text-accent-2">olivier@example.com</code> — Authority plan client</li>
            </ul>
            <p className="mt-3 text-text-dim">
              Any other email signs in as Marc by default.
            </p>
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
