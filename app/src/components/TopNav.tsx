import Link from "next/link";
import { Logo } from "./Logo";
import { UserMenu } from "./UserMenu";
import { FeedbackButton } from "./FeedbackButton";
import type { User } from "@/lib/types";
import { getUserByEmail, trialStateFor } from "@/lib/auth-store";

export async function TopNav({
  user,
  backHref,
  backLabel,
}: {
  user: User;
  backHref?: string;
  backLabel?: string;
}) {
  // Pull trial state from DB. Cheap query; lets the banner stay accurate
  // even when the session JWT is older than the latest plan change.
  const trial =
    user.role === "client" && !user.guest
      ? trialStateFor(
          (await getUserByEmail(user.email).catch(() => null)) ?? {
            trialEndsAt: undefined,
            stripeSubscriptionId: undefined,
          },
        )
      : { active: false, endsAt: null, daysLeft: 0 };

  return (
    <>
    {user.guest ? (
      <div className="bg-[rgba(168,85,247,0.18)] border-b border-[rgba(168,85,247,0.35)] text-[#e9d5ff] text-[12px] text-center py-1.5 px-4">
        Guest editor mode — viewing as {user.firstName} {user.lastName}.
        Notes you leave are signed <strong>{user.guest.name}</strong>.
      </div>
    ) : null}
    {trial.active ? (
      <div className="bg-[rgba(16,185,129,0.12)] border-b border-[rgba(16,185,129,0.3)] text-[#34d399] text-[12px] text-center py-1.5 px-4">
        Free trial — {trial.daysLeft} day{trial.daysLeft === 1 ? "" : "s"} left.{" "}
        <Link href="/settings/billing" className="underline font-medium">
          Pick a plan
        </Link>{" "}
        to keep your features after it ends.
      </div>
    ) : null}
    <header className="sticky top-0 z-50 flex items-center justify-between px-4 sm:px-8 py-3 sm:py-4 border-b border-[rgba(255,255,255,0.08)] bg-[rgba(10,10,11,0.85)] backdrop-blur-xl gap-2">
      <div className="flex items-center gap-3 sm:gap-6 min-w-0">
        {backHref ? (
          <Link
            href={backHref}
            aria-label={backLabel ?? "Back"}
            className="text-text-muted hover:text-text flex items-center gap-2 shrink-0"
          >
            <span className="text-[18px] sm:text-[13px]">←</span>
            <span className="hidden sm:inline text-[13px]">{backLabel ?? "Back"}</span>
          </Link>
        ) : null}
        <Logo />
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <FeedbackButton />
        <button
          aria-label="Notifications"
          className="w-9 h-9 rounded-full bg-bg-elev border border-border hover:border-border-strong flex items-center justify-center text-text-muted hover:text-text"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </button>
        <Link
          href="/settings"
          aria-label="Settings"
          className="w-9 h-9 rounded-full bg-bg-elev border border-border hover:border-border-strong flex items-center justify-center text-text-muted hover:text-text"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </Link>
        <UserMenu user={user} />
      </div>
    </header>
    </>
  );
}
