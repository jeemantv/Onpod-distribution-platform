"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { User } from "@/lib/types";

export function UserMenu({ user }: { user: User }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function signOut() {
    await fetch("/api/auth/signout", { method: "POST" }).catch(() => {});
    router.push("/login");
    router.refresh();
  }

  const isStaff = user.role === "admin" || (user.role as string) === "editor";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`${user.firstName} ${user.lastName} menu`}
        className="w-9 h-9 rounded-full flex items-center justify-center font-semibold text-[13px]"
        style={{ background: user.avatarColor }}
      >
        {user.avatar}
      </button>
      {open ? (
        <div className="absolute right-0 mt-2 w-56 bg-bg-elev border border-border rounded-[10px] shadow-float overflow-hidden text-[13px] z-50">
          <div className="px-3 py-2.5 border-b border-border">
            <div className="font-medium truncate">
              {user.firstName} {user.lastName}
            </div>
            <div className="text-text-muted text-[11px] truncate">{user.email}</div>
            <div className="text-text-dim text-[10px] uppercase tracking-wider mt-1">
              {user.role}
            </div>
          </div>
          {!isStaff ? (
            <Link
              href="/account"
              className="block px-3 py-2 hover:bg-bg-elev-2"
              onClick={() => setOpen(false)}
            >
              Your sessions
            </Link>
          ) : null}
          <Link
            href="/settings"
            className="block px-3 py-2 hover:bg-bg-elev-2"
            onClick={() => setOpen(false)}
          >
            Settings
          </Link>
          <button
            type="button"
            onClick={signOut}
            className="block w-full text-left px-3 py-2 hover:bg-bg-elev-2 border-t border-border text-danger"
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
