"use client";

export function SignOutButton() {
  const onClick = async () => {
    await fetch("/api/auth/signout", { method: "POST" });
    window.location.href = "/login";
  };
  return (
    <button
      onClick={onClick}
      className="px-4 py-2 rounded-[8px] bg-bg-elev-3 border border-border text-[13px] text-text-muted hover:text-text"
    >
      Sign out
    </button>
  );
}
