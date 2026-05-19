"use client";

import { useEffect, useMemo, useState } from "react";

interface HistoryRow {
  id: string;
  fileName: string;
  platform: "youtube" | "spotify" | "opusclip";
  action: "draft" | "scheduled" | "published";
  vidType: "long" | "short" | null;
  scheduledFor: string | null;
  createdAt: string;
  externalUrl: string | null;
  metadata: Record<string, unknown>;
}

const COLOR_FOR: Record<"published" | "scheduled" | "draft", string> = {
  published: "bg-success/80",
  scheduled: "bg-warning/80",
  draft: "bg-text-muted/50",
};

const RING_FOR: Record<"published" | "scheduled" | "draft", string> = {
  published: "border-success/80",
  scheduled: "border-warning/80",
  draft: "border-text-muted/50",
};

export function PublishingCalendar({
  platform = "youtube",
}: {
  platform?: "youtube" | "spotify";
}) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/publish/history");
      if (!res.ok) return;
      const body = (await res.json()) as { history: HistoryRow[] };
      setRows(body.history.filter((r) => r.platform === platform));
    })();
  }, [platform]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, HistoryRow[]> = {};
    for (const r of rows) {
      const iso = (r.scheduledFor ?? r.createdAt).slice(0, 10);
      (map[iso] ??= []).push(r);
    }
    return map;
  }, [rows]);

  const year = cursor.getFullYear();
  const m = cursor.getMonth();
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const firstDow = new Date(year, m, 1).getDay();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="bg-bg-elev-2 border border-border rounded-[12px] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="display text-[16px]">
          {cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setCursor(new Date(year, m - 1, 1))} className="text-text-muted hover:text-text px-2">
            ‹
          </button>
          <button onClick={() => setCursor(new Date(year, m + 1, 1))} className="text-text-muted hover:text-text px-2">
            ›
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-text-dim mb-1">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDow }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
          const iso = `${year}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const events = eventsByDate[iso] ?? [];
          const isToday = iso === today;
          return (
            <div
              key={day}
              className={`relative min-h-[54px] rounded-[6px] p-1.5 text-[11px] ${
                isToday ? "border-2 border-accent bg-bg-elev-3" : "border border-border bg-bg-elev"
              }`}
            >
              <div className="text-text-muted">{day}</div>
              <div className="flex flex-col gap-0.5 mt-1">
                {events.slice(0, 4).map((e, i) => (
                  <div
                    key={i}
                    title={`${e.fileName} (${e.action}${e.vidType === "short" ? ", Short" : ""})`}
                    className={`h-1 rounded ${
                      e.vidType === "short"
                        ? `${RING_FOR[e.action]} border-2 bg-transparent`
                        : COLOR_FOR[e.action]
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
        <Legend cls="bg-success/80" label="Published" />
        <Legend cls="bg-warning/80" label="Scheduled" />
        <Legend cls="bg-text-muted/50" label="Draft" />
        <Legend cls="border-2 border-success/80 bg-transparent" label="Short" />
      </div>
    </div>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-3 h-1 rounded ${cls}`} />
      {label}
    </span>
  );
}
