"use client";

// Client-side "Start a new session" — computes a Pearl-style folder
// name (YYYY-MM-DD_HH-MM_email) so sessionBelongsToEmail accepts it,
// then navigates to the session page where the SessionUploader is
// rendered. The folder materializes in B2 on first file upload.

import { useRouter } from "next/navigation";
import { useState } from "react";

function nowFolderName(email: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}-${pad(d.getMinutes())}`;
  return `${date}_${time}_${email}`;
}

export function StartSessionButton({
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
    router.push(`/account/sessions/${homeStudio}/${encodeURIComponent(folder)}`);
  };
  return (
    <button
      onClick={start}
      disabled={busy}
      className="px-4 py-2 rounded-[10px] bg-accent text-white text-[13px] font-medium hover:opacity-90 disabled:opacity-50"
    >
      {busy ? "Starting…" : "+ Start new session"}
    </button>
  );
}
