import Link from "next/link";
import { Logo } from "./Logo";
import type { User } from "@/lib/types";

export function TopNav({
  user,
  backHref,
  backLabel,
}: {
  user: User;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <header className="sticky top-0 z-50 flex items-center justify-between px-8 py-4 border-b border-[rgba(255,255,255,0.08)] bg-[rgba(10,10,11,0.85)] backdrop-blur-xl">
      <div className="flex items-center gap-6">
        {backHref ? (
          <Link
            href={backHref}
            className="text-text-muted hover:text-text text-[13px] flex items-center gap-2"
          >
            ← {backLabel ?? "Back"}
          </Link>
        ) : null}
        <Logo />
      </div>

      <div className="flex items-center gap-3">
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
        <div
          className="w-[34px] h-[34px] rounded-full flex items-center justify-center font-semibold text-[13px]"
          style={{ background: user.avatarColor }}
          title={`${user.firstName} ${user.lastName}`}
        >
          {user.avatar}
        </div>
      </div>
    </header>
  );
}
