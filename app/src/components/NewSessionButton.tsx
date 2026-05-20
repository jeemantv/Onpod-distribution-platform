"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  BUCKETS,
  buildSessionFolder,
  type Bucket,
  type StudioSlug,
} from "@/lib/studio";

function todayPair(): { date: string; time: string } {
  const d = new Date();
  const date = d.toISOString().slice(0, 10);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return { date, time: `${hh}:${mm}` };
}

export function NewSessionButton({
  studio,
  bucket,
}: {
  studio: StudioSlug;
  bucket: Bucket;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { date: today, time: now } = todayPair();
  const [date, setDate] = useState(today);
  const [time, setTime] = useState(now);
  const [email, setEmail] = useState("");

  function create() {
    let folder: string;
    if (bucket === "clients") {
      if (!email.trim()) {
        alert("Email is required for clients/ sessions.");
        return;
      }
      folder = buildSessionFolder(date, time, email.trim().toLowerCase());
    } else {
      folder = `${date}_${time.replace(":", "-")}_${bucket}`;
    }
    router.push(
      `/admin/studios/${studio}/${bucket}/${encodeURIComponent(folder)}`,
    );
  }

  if (!BUCKETS.includes(bucket)) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 rounded-[10px] bg-accent text-white text-[12px]"
      >
        + New session
      </button>
      {open ? (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center px-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-bg-elev border border-border rounded-[14px] w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[18px] font-semibold mb-3">New session</h3>
            <div className="flex gap-3 mb-3">
              <div className="flex-1">
                <label className="text-[11px] text-text-muted">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 bg-bg-elev-2 border border-border rounded-[8px] text-[13px]"
                />
              </div>
              <div className="flex-1">
                <label className="text-[11px] text-text-muted">Time</label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full px-3 py-2 bg-bg-elev-2 border border-border rounded-[8px] text-[13px]"
                />
              </div>
            </div>
            {bucket === "clients" ? (
              <div className="mb-3">
                <label className="text-[11px] text-text-muted">
                  Client email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="client@example.com"
                  className="w-full px-3 py-2 bg-bg-elev-2 border border-border rounded-[8px] text-[13px]"
                />
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="px-3 py-1.5 rounded-[8px] bg-bg-elev-3 border border-border text-[12px]"
              >
                Cancel
              </button>
              <button
                onClick={create}
                className="px-3 py-1.5 rounded-[8px] bg-accent text-white text-[12px]"
              >
                Create + upload
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
