"use client";

// Admin-side "Upload session for {client}" — same folder convention as
// the client's own start-session, but navigates the admin to the studio
// view where the SessionUploader is rendered.

import { useRouter } from "next/navigation";
import { useState } from "react";

function nowFolderName(email: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}-${pad(d.getMinutes())}`;
  return `${date}_${time}_${email}`;
}

export function StartClientSessionButton({
  homeStudio,
  email,
}: {
  homeStudio: string;
  email: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const start = () => {
    setBusy(true);
    const folder = nowFolderName(email);
    router.push(
      `/admin/studios/${homeStudio}/clients/${encodeURIComponent(folder)}`,
    );
  };
  return (
    <button
      onClick={start}
      disabled={busy}
      className="px-4 py-2 rounded-[10px] bg-accent text-white text-[13px] font-medium hover:opacity-90 disabled:opacity-50"
    >
      {busy ? "Opening…" : "+ Upload new session"}
    </button>
  );
}
