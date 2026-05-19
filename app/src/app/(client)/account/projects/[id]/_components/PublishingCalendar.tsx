"use client";

import { useState } from "react";

type Event = {
  date: string;
  kind: "published" | "scheduled" | "draft";
  vidType: "long" | "short";
  title: string;
};

const MOCK: Event[] = [
  { date: "2026-05-08", kind: "published", vidType: "long", title: "E46" },
  { date: "2026-05-13", kind: "published", vidType: "short", title: "Hiring mistake clip" },
  { date: "2026-05-19", kind: "draft", vidType: "long", title: "E47 (in review)" },
  { date: "2026-05-22", kind: "scheduled", vidType: "long", title: "E45 catchup" },
  { date: "2026-05-22", kind: "scheduled", vidType: "short", title: "E47 hook" },
  { date: "2026-05-26", kind: "scheduled", vidType: "short", title: "E47 disagreement" },
  { date: "2026-05-29", kind: "scheduled", vidType: "long", title: "E48 prep" },
];

const PALETTE = {
  published: "bg-success/80",
  scheduled: "bg-warning/80",
  draft: "bg-text-muted/50",
};

export function PublishingCalendar() {
  const [cursor, setCursor] = useState(new Date(2026, 4, 1));
  const year = cursor.getFullYear();
  const m = cursor.getMonth();
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const firstDow = new Date(year, m, 1).getDay();
  const today = "2026-05-19";

  return (
    <div className="bg-bg-elev-2 border border-border rounded-[12px] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="display text-[16px]">
          {cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCursor(new Date(year, m - 1, 1))}
            className="text-text-muted hover:text-text px-2"
          >
            ‹
          </button>
          <button
            onClick={() => setCursor(new Date(year, m + 1, 1))}
            className="text-text-muted hover:text-text px-2"
          >
            ›
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-text-dim mb-1">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDow }).map((_, i) => <div key={`pad-${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const iso = `${year}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const events = MOCK.filter((e) => e.date === iso);
          const isToday = iso === today;
          return (
            <div
              key={day}
              className={`relative min-h-[54px] rounded-[6px] p-1.5 text-[11px] ${
                isToday
                  ? "border-2 border-accent bg-bg-elev-3"
                  : "border border-border bg-bg-elev"
              }`}
            >
              <div className="text-text-muted">{day}</div>
              <div className="flex flex-col gap-0.5 mt-1">
                {events.slice(0, 4).map((e, i) => (
                  <div
                    key={i}
                    title={`${e.title} (${e.kind}${e.vidType === "short" ? ", Short" : ""})`}
                    className={`h-1 rounded ${
                      e.vidType === "short"
                        ? `${PALETTE[e.kind].replace("bg-", "border-")} border-2 bg-transparent`
                        : PALETTE[e.kind]
                    }`}
                  />
                ))}
                {events.length > 4 ? (
                  <div className="text-[9px] text-text-dim">+{events.length - 4}</div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-4 mt-3 text-[11px] text-text-muted flex-wrap">
        <Legend color="bg-success/80" label="Published" />
        <Legend color="bg-warning/80" label="Scheduled" />
        <Legend color="bg-text-muted/50" label="Draft" />
        <Legend color="border-2 border-success/80 bg-transparent" label="Short" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-3 h-1 rounded ${color}`} />
      {label}
    </span>
  );
}
