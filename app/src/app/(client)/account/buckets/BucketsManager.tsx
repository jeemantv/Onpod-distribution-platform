"use client";

import { useEffect, useState } from "react";

interface Channel {
  id: string;
  title: string;
}
interface Item {
  id: string;
  fileKey: string;
  fileName: string;
  postCount: number;
  aiTitle: string | null;
  aiDescription: string | null;
  thumbnailUrl: string | null;
  nextPostAt: string | null;
}

function cleanName(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/_+/g, " ").trim();
}

function formatWhen(iso: string | null, tz: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone: tz,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return new Date(iso).toLocaleString();
  }
}
interface Bucket {
  id: string;
  name: string;
  channelId: string;
  channelTitle: string | null;
  visibility: string;
  language: string;
  times: string[];
  days: number[];
  timezone: string;
  shuffle: boolean;
  titleTemplate: string | null;
  active: boolean;
  cursor: number;
  lastPostedAt: string | null;
  items: Item[];
  lastPost: { at: string; url: string | null; fileName: string } | null;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const COMMON_TZ = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "UTC",
];
const LANGUAGES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "pt", label: "Portuguese" },
  { code: "it", label: "Italian" },
  { code: "nl", label: "Dutch" },
  { code: "hi", label: "Hindi" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "zh", label: "Chinese" },
];

export function BucketsManager() {
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [ytConnected, setYtConnected] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    const [bRes, yRes] = await Promise.all([fetch("/api/buckets"), fetch("/api/youtube/me")]);
    const bBody = (await bRes.json()) as { buckets?: Bucket[] };
    const yBody = (await yRes.json()) as { connected?: boolean; channels?: Channel[] };
    setBuckets(bBody.buckets ?? []);
    setChannels(yBody.channels ?? []);
    setYtConnected(!!yBody.connected);
    setLoading(false);
  };
  useEffect(() => {
    void load();
  }, []);

  const createBucket = async (data: Record<string, unknown>) => {
    setError(null);
    const res = await fetch("/api/buckets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError((b as { message?: string }).message ?? "Couldn't create bucket");
      return;
    }
    setCreating(false);
    await load();
  };

  if (loading) return <div className="text-[13px] text-text-muted">Loading…</div>;

  if (!ytConnected) {
    return (
      <div className="p-4 rounded-[12px] border border-border bg-bg-elev-2 text-[13px]">
        Connect YouTube first (open a clip → YouTube → Connect), then come back to
        set up auto-posting.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error ? (
        <div className="p-3 rounded-[10px] bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-[12px] text-[#f87171]">
          {error}
        </div>
      ) : null}

      {buckets.map((b) => (
        <BucketCard key={b.id} bucket={b} channels={channels} onChange={load} setError={setError} />
      ))}

      {creating ? (
        <BucketForm
          channels={channels}
          onCancel={() => setCreating(false)}
          onSubmit={createBucket}
        />
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="px-4 py-2 rounded-[10px] bg-accent text-white text-[13px] font-medium"
        >
          + New bucket
        </button>
      )}

      <p className="text-[11px] text-text-dim pt-2">
        Add clips to a bucket from the <b>Clips</b> tab of any project: select clips →{" "}
        <b>Add to bucket</b>.
      </p>
    </div>
  );
}

function scheduleSummary(b: Bucket): string {
  const times = b.times.length ? b.times.join(", ") : "no times set";
  const days =
    b.days.length === 0 || b.days.length === 7
      ? "every day"
      : b.days.map((d) => DAY_LABELS[d]).join(", ");
  return `${times} · ${days} · ${b.timezone}`;
}

function BucketCard({
  bucket,
  channels,
  onChange,
  setError,
}: {
  bucket: Bucket;
  channels: Channel[];
  onChange: () => Promise<void>;
  setError: (s: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const patch = async (data: Record<string, unknown>) => {
    await fetch(`/api/buckets/${bucket.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    await onChange();
  };

  const remove = async () => {
    if (!confirm(`Delete bucket “${bucket.name}”? This won't delete the clips.`)) return;
    await fetch(`/api/buckets/${bucket.id}`, { method: "DELETE" });
    await onChange();
  };

  const removeItem = async (itemId: string) => {
    await fetch(`/api/buckets/${bucket.id}/items`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId }),
    });
    await onChange();
  };

  const postNow = async () => {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const res = await fetch(`/api/buckets/${bucket.id}/post-now`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((body as { message?: string }).message ?? "Post failed");
      } else {
        setMsg(`Posted “${(body as { fileName?: string }).fileName ?? "clip"}” ✓`);
      }
      await onChange();
    } finally {
      setBusy(false);
    }
  };

  // "Next up" = the item with the earliest projected post time (correct for
  // both fixed rotation and shuffle); fall back to cursor order if unscheduled.
  const scheduledNext = [...bucket.items]
    .filter((it) => it.nextPostAt)
    .sort((a, b) => (a.nextPostAt! < b.nextPostAt! ? -1 : 1))[0];
  const nextItem =
    scheduledNext ??
    (bucket.items.length ? bucket.items[bucket.cursor % bucket.items.length] : null);

  return (
    <div className="rounded-[14px] border border-border bg-bg-elev p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-semibold truncate">{bucket.name}</h3>
            <span
              className={`text-[10px] uppercase px-1.5 py-0.5 rounded-full ${
                bucket.active
                  ? "bg-[rgba(16,185,129,0.15)] text-[#34d399]"
                  : "bg-bg-elev-3 text-text-muted"
              }`}
            >
              {bucket.active ? "Active" : "Paused"}
            </span>
            {bucket.shuffle ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-bg-elev-3 text-accent-2">
                🔀 Shuffle
              </span>
            ) : null}
          </div>
          <div className="text-[12px] text-text-muted mt-0.5">
            → {bucket.channelTitle || bucket.channelId} · {bucket.visibility}
          </div>
          <div className="text-[11px] text-text-dim mt-0.5">{scheduleSummary(bucket)}</div>
          {bucket.lastPost ? (
            <div className="text-[11px] text-[#34d399] mt-1">
              ✓ Last posted {formatWhen(bucket.lastPost.at, bucket.timezone)}
              {bucket.lastPost.url ? (
                <>
                  {" — "}
                  <a
                    href={bucket.lastPost.url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline hover:text-text"
                  >
                    view on YouTube
                  </a>
                </>
              ) : null}
            </div>
          ) : (
            <div className="text-[11px] text-text-dim mt-1">Not posted yet</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void patch({ active: !bucket.active })}
            className="px-2.5 py-1.5 rounded-[8px] bg-bg-elev-2 border border-border text-[12px]"
          >
            {bucket.active ? "Pause" : "Resume"}
          </button>
          <button
            onClick={() => setEditing((v) => !v)}
            className="px-2.5 py-1.5 rounded-[8px] bg-bg-elev-2 border border-border text-[12px]"
          >
            {editing ? "Close" : "Edit"}
          </button>
          <button
            onClick={() => void remove()}
            className="px-2.5 py-1.5 rounded-[8px] text-[12px] text-danger hover:underline"
          >
            Delete
          </button>
        </div>
      </div>

      {editing ? (
        <div className="mt-4 pt-4 border-t border-border">
          <BucketForm
            channels={channels}
            initial={bucket}
            onCancel={() => setEditing(false)}
            onSubmit={async (data) => {
              await patch(data);
              setEditing(false);
            }}
          />
        </div>
      ) : null}

      {/* Rotation / items */}
      <div className="mt-4 pt-3 border-t border-border">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[12px] text-text-muted">
            {bucket.items.length} clip{bucket.items.length === 1 ? "" : "s"} in rotation
            {nextItem ? (
              <>
                {" "}
                · next up: <b className="text-text">{nextItem.fileName}</b>
              </>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {msg ? <span className="text-[11px] text-accent">{msg}</span> : null}
            <button
              onClick={() => void postNow()}
              disabled={busy || bucket.items.length === 0}
              className="px-2.5 py-1 rounded-[8px] bg-accent-2/20 border border-accent-2 text-accent-2 text-[11px] disabled:opacity-50"
            >
              {busy ? "Posting…" : "▶ Post next now"}
            </button>
          </div>
        </div>
        {bucket.items.length === 0 ? (
          <div className="text-[11px] text-text-dim">
            No clips yet. Add some from a project&apos;s Clips tab.
          </div>
        ) : (
          <ul className="space-y-2">
            {bucket.items.map((it, i) => (
              <li
                key={it.id}
                className={`flex items-start gap-3 p-2 rounded-[10px] ${
                  nextItem?.id === it.id ? "bg-bg-elev-2 border border-accent-2/40" : "border border-transparent"
                }`}
              >
                <span className="text-text-dim text-[12px] w-4 shrink-0 pt-0.5">{i + 1}</span>
                <div className="w-[88px] aspect-video rounded-[6px] overflow-hidden bg-bg-elev-3 shrink-0 flex items-center justify-center">
                  {it.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={it.thumbnailUrl}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ) : (
                    <span className="text-[9px] text-text-dim">clip</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-medium truncate">
                    {it.aiTitle?.trim() || cleanName(it.fileName)}
                  </div>
                  {it.aiDescription?.trim() ? (
                    <div className="text-[11px] text-text-muted line-clamp-2 mt-0.5">
                      {it.aiDescription}
                    </div>
                  ) : (
                    <div className="text-[11px] text-text-dim mt-0.5">
                      No AI metadata yet — add AI to this clip for a real title &amp; description.
                    </div>
                  )}
                  <div className="text-[11px] mt-1">
                    {it.nextPostAt ? (
                      <span className="text-accent-2">
                        🗓 Posts {formatWhen(it.nextPostAt, bucket.timezone)}
                      </span>
                    ) : !bucket.active ? (
                      <span className="text-text-dim">Paused</span>
                    ) : bucket.times.length === 0 ? (
                      <span className="text-text-dim">Set post times to schedule</span>
                    ) : (
                      <span className="text-text-dim">Queued</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {it.postCount > 0 ? (
                    <span className="text-[10px] text-text-dim">posted ×{it.postCount}</span>
                  ) : null}
                  <button
                    onClick={() => void removeItem(it.id)}
                    className="text-text-dim hover:text-danger text-[16px] leading-none"
                    aria-label="Remove"
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function BucketForm({
  channels,
  initial,
  onCancel,
  onSubmit,
}: {
  channels: Channel[];
  initial?: Bucket;
  onCancel: () => void;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [channelId, setChannelId] = useState(initial?.channelId ?? channels[0]?.id ?? "");
  const [visibility, setVisibility] = useState(initial?.visibility ?? "public");
  const [language, setLanguage] = useState(initial?.language ?? "en");
  const [timesText, setTimesText] = useState((initial?.times ?? ["09:00"]).join(", "));
  const [days, setDays] = useState<number[]>(initial?.days ?? []);
  const [timezone, setTimezone] = useState(
    initial?.timezone ??
      (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "America/New_York"),
  );
  const [titleTemplate, setTitleTemplate] = useState(initial?.titleTemplate ?? "");
  const [shuffle, setShuffle] = useState(initial?.shuffle ?? false);
  const [busy, setBusy] = useState(false);

  const toggleDay = (d: number) =>
    setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));

  const submit = async () => {
    const times = timesText
      .split(",")
      .map((t) => t.trim())
      .filter((t) => /^\d{1,2}:\d{2}$/.test(t))
      .map((t) => (t.length === 4 ? `0${t}` : t));
    setBusy(true);
    await onSubmit({
      name: name.trim(),
      channelId,
      channelTitle: channels.find((c) => c.id === channelId)?.title ?? null,
      visibility,
      language,
      times,
      days,
      timezone,
      shuffle,
      titleTemplate: titleTemplate.trim() || null,
    });
    setBusy(false);
  };

  const tzOptions = COMMON_TZ.includes(timezone) ? COMMON_TZ : [timezone, ...COMMON_TZ];

  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[11px] text-text-muted">Bucket name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Daily Shorts"
            className="mt-1 w-full px-3 py-2 rounded-[8px] bg-bg-elev-2 border border-border text-[13px]"
          />
        </label>
        <label className="block">
          <span className="text-[11px] text-text-muted">Post to channel</span>
          <select
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            className="mt-1 w-full px-2 py-2 rounded-[8px] bg-bg-elev-2 border border-border text-[13px]"
          >
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] text-text-muted">Post times (24h, comma-separated)</span>
          <input
            value={timesText}
            onChange={(e) => setTimesText(e.target.value)}
            placeholder="09:00, 17:00"
            className="mt-1 w-full px-3 py-2 rounded-[8px] bg-bg-elev-2 border border-border text-[13px]"
          />
        </label>
        <label className="block">
          <span className="text-[11px] text-text-muted">Visibility</span>
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value)}
            className="mt-1 w-full px-2 py-2 rounded-[8px] bg-bg-elev-2 border border-border text-[13px]"
          >
            <option value="public">Public</option>
            <option value="unlisted">Unlisted</option>
            <option value="private">Private</option>
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] text-text-muted">Language (set on YouTube)</span>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="mt-1 w-full px-2 py-2 rounded-[8px] bg-bg-elev-2 border border-border text-[13px]"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] text-text-muted">Timezone</span>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="mt-1 w-full px-2 py-2 rounded-[8px] bg-bg-elev-2 border border-border text-[13px]"
          >
            {tzOptions.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] text-text-muted">Title template (optional)</span>
          <input
            value={titleTemplate}
            onChange={(e) => setTitleTemplate(e.target.value)}
            placeholder="{title}  ·  uses the clip name; {n} = post number"
            className="mt-1 w-full px-3 py-2 rounded-[8px] bg-bg-elev-2 border border-border text-[13px]"
          />
        </label>
      </div>

      <div>
        <span className="text-[11px] text-text-muted">Days (none = every day)</span>
        <div className="flex gap-1.5 mt-1 flex-wrap">
          {DAY_LABELS.map((d, i) => (
            <button
              key={d}
              type="button"
              onClick={() => toggleDay(i)}
              className={`px-2.5 py-1 rounded-[8px] text-[12px] border ${
                days.includes(i)
                  ? "bg-accent text-white border-accent"
                  : "bg-bg-elev-2 border-border text-text-muted"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={shuffle}
          onChange={(e) => setShuffle(e.target.checked)}
          className="accent-accent w-4 h-4"
        />
        <span className="text-[12px]">
          🔀 Shuffle — mix all clips into a random order each cycle (every clip still posts once before repeating)
        </span>
      </label>

      <div className="flex items-center gap-2">
        <button
          onClick={() => void submit()}
          disabled={busy || !name.trim() || !channelId}
          className="px-4 py-2 rounded-[10px] bg-accent text-white text-[13px] font-medium disabled:opacity-50"
        >
          {busy ? "Saving…" : initial ? "Save changes" : "Create bucket"}
        </button>
        <button onClick={onCancel} className="px-3 py-2 text-[13px] text-text-muted">
          Cancel
        </button>
      </div>
    </div>
  );
}
