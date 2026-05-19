"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import type { FileItem, VidType } from "@/lib/types";
import { PublishingCalendar } from "./PublishingCalendar";

export function YouTubeModal({
  fileId,
  file,
  aiReady,
  onClose,
}: {
  fileId: string;
  file: FileItem;
  aiReady: boolean;
  onClose: () => void;
}) {
  void fileId;
  const [connected, setConnected] = useState(true);
  const [title, setTitle] = useState(
    aiReady
      ? "Why most founders never escape the grind (and what the 1% do differently)"
      : "",
  );
  const [description, setDescription] = useState(
    aiReady ? "Three seven-figure Canadian founders share the mistakes…" : "",
  );
  const [publishMode, setPublishMode] = useState<
    "now" | "schedule" | "private"
  >("schedule");
  const [vidType, setVidType] = useState<VidType>("long");
  const [visibility, setVisibility] = useState<"public" | "unlisted" | "private">(
    "public",
  );
  const [scheduledDate, setScheduledDate] = useState<string | null>(null);

  const conflicts = useMemo(
    () => ({
      "2026-05-22": vidType,
      "2026-05-29": vidType,
    }),
    [vidType],
  );

  if (!connected) {
    return (
      <Modal title="YouTube" subtitle="Connect your channel" onClose={onClose} size="md">
        <div className="text-center py-8">
          <div className="inline-flex w-14 h-14 rounded-full bg-[rgba(239,68,68,0.15)] text-[#f87171] items-center justify-center mb-4">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58 2.78 2.78 0 0 0 1.94 2C5.12 20 12 20 12 20s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58zM9.75 15.5v-7L15.5 12z" />
            </svg>
          </div>
          <p className="text-[14px] mb-1">Connect YouTube to publish from OnPod</p>
          <p className="text-[12px] text-text-muted mb-6">
            You&apos;ll grant the YouTube upload scope. We never post without your action.
          </p>
          <button
            onClick={() => setConnected(true)}
            className="px-5 py-2.5 rounded-[10px] bg-accent text-white font-medium text-[13px]"
          >
            Connect YouTube
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Publish to YouTube"
      subtitle={file.name}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 rounded-[8px] text-text-muted hover:text-text">
            Cancel
          </button>
          <button className="px-5 py-2.5 rounded-[10px] bg-bg-elev-3 border border-border-strong text-[13px]">
            Save as draft
          </button>
          <button className="px-5 py-2.5 rounded-[10px] bg-accent text-white text-[13px] font-medium">
            {publishMode === "now"
              ? "Publish now"
              : publishMode === "schedule"
                ? "Schedule"
                : "Save private"}
          </button>
        </>
      }
    >
      <div className="flex items-center gap-3 mb-5 p-3 bg-bg-elev-2 border border-border rounded-[12px]">
        <div className="w-10 h-10 rounded-full bg-[linear-gradient(135deg,#ff3b30,#ff8a00)] flex items-center justify-center font-semibold text-[13px]">
          OP
        </div>
        <div className="flex-1">
          <div className="text-[13px] font-medium">OnPod Studios</div>
          <div className="text-[11px] text-text-muted">@onpodstudios · 12.4K subscribers</div>
        </div>
        <button onClick={() => setConnected(false)} className="text-[12px] text-text-muted hover:text-text">
          Switch account
        </button>
      </div>

      <div
        className={`mb-5 p-3 rounded-[10px] border text-[12px] flex items-center gap-2 ${
          aiReady
            ? "bg-[rgba(16,185,129,0.08)] border-[rgba(16,185,129,0.25)] text-[#34d399]"
            : "bg-[rgba(245,158,11,0.08)] border-[rgba(245,158,11,0.25)] text-[#fbbf24]"
        }`}
      >
        {aiReady
          ? "AI-generated metadata loaded. Edit before publishing."
          : "No AI content yet — run the AI button on this file first for auto-filled metadata."}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <FieldLabel>Title</FieldLabel>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            className="input-yt"
          />
          <p className="text-[11px] text-text-dim mt-1">{title.length}/100</p>
        </div>

        <div className="col-span-2">
          <FieldLabel>Description</FieldLabel>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            maxLength={5000}
            className="input-yt"
          />
          <p className="text-[11px] text-text-dim mt-1">{description.length}/5000</p>
        </div>

        <div>
          <FieldLabel>Video type</FieldLabel>
          <div className="flex bg-bg-elev-2 border border-border rounded-[10px] p-1">
            <button
              onClick={() => setVidType("long")}
              className={`flex-1 py-1.5 text-[12px] rounded-[6px] ${
                vidType === "long" ? "bg-bg-elev-3 text-text" : "text-text-muted"
              }`}
            >
              Regular video
            </button>
            <button
              onClick={() => setVidType("short")}
              className={`flex-1 py-1.5 text-[12px] rounded-[6px] ${
                vidType === "short" ? "bg-bg-elev-3 text-text" : "text-text-muted"
              }`}
            >
              YouTube Short
            </button>
          </div>
        </div>

        <div>
          <FieldLabel>Visibility</FieldLabel>
          <div className="flex bg-bg-elev-2 border border-border rounded-[10px] p-1">
            {(["public", "unlisted", "private"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setVisibility(v)}
                className={`flex-1 py-1.5 text-[12px] rounded-[6px] capitalize ${
                  visibility === v ? "bg-bg-elev-3 text-text" : "text-text-muted"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <div>
          <FieldLabel>Publish mode</FieldLabel>
          <select
            value={publishMode}
            onChange={(e) => setPublishMode(e.target.value as typeof publishMode)}
            className="input-yt"
          >
            <option value="now">Publish immediately</option>
            <option value="schedule">Schedule for later</option>
            <option value="private">Save as private</option>
          </select>
        </div>

        <div>
          <FieldLabel>Playlist</FieldLabel>
          <select className="input-yt">
            <option>(none)</option>
            <option>Founders Lounge — Episodes</option>
            <option>Best Moments</option>
          </select>
        </div>

        <div>
          <FieldLabel>Category</FieldLabel>
          <select className="input-yt">
            <option>Education</option>
            <option>People &amp; Blogs</option>
            <option>Science &amp; Technology</option>
          </select>
        </div>

        <div>
          <FieldLabel>Language</FieldLabel>
          <select className="input-yt">
            <option>English</option>
            <option>Français</option>
            <option>Español</option>
          </select>
        </div>

        {publishMode === "schedule" ? (
          <div className="col-span-2">
            <FieldLabel>Schedule date</FieldLabel>
            <SchedulePicker
              vidType={vidType}
              conflicts={conflicts}
              value={scheduledDate}
              onChange={setScheduledDate}
            />
          </div>
        ) : null}

        <div className="col-span-2">
          <FieldLabel>Publishing calendar</FieldLabel>
          <PublishingCalendar />
        </div>
      </div>

      <style jsx>{`
        :global(.input-yt) {
          width: 100%;
          padding: 10px 14px;
          background: #1c1c20;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          color: #fafafa;
          font-family: inherit;
          font-size: 13px;
        }
        :global(.input-yt:focus) {
          outline: none;
          border-color: rgba(255, 255, 255, 0.16);
        }
      `}</style>
    </Modal>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[12px] text-text-muted mb-2">{children}</label>
  );
}

function SchedulePicker({
  vidType,
  conflicts,
  value,
  onChange,
}: {
  vidType: VidType;
  conflicts: Record<string, VidType>;
  value: string | null;
  onChange: (v: string) => void;
}) {
  const [month, setMonth] = useState(new Date(2026, 4, 1));
  const year = month.getFullYear();
  const m = month.getMonth();
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const firstDow = new Date(year, m, 1).getDay();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="bg-bg-elev-2 border border-border rounded-[12px] p-4">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => setMonth(new Date(year, m - 1, 1))}
          className="text-text-muted hover:text-text px-2"
        >
          ‹
        </button>
        <div className="display text-[16px]">
          {month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </div>
        <button
          onClick={() => setMonth(new Date(year, m + 1, 1))}
          className="text-text-muted hover:text-text px-2"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-text-dim mb-1">
        {["S","M","T","W","T","F","S"].map((d, i) => <div key={i}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDow }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const date = new Date(year, m, day);
          const iso = date.toISOString().slice(0, 10);
          const past = date < today;
          const conflict = conflicts[iso] === vidType;
          const selected = value === iso;
          return (
            <button
              key={day}
              disabled={past}
              onClick={() => onChange(iso)}
              title={conflict ? `Conflict: another ${vidType === "short" ? "Short" : "video"} on this day` : ""}
              className={`relative h-9 rounded-[6px] text-[12px] ${
                past
                  ? "text-text-dim/40 cursor-not-allowed"
                  : selected
                    ? "bg-accent text-white"
                    : "hover:bg-bg-elev-3"
              }`}
            >
              {day}
              {conflict && !selected ? (
                <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-warning" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
