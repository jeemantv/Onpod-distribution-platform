"use client";

// Frame-accurate review for a single video file.
//
// Keyboard shortcuts (Premiere-style) — active while the player is focused:
//   Space / K  — play/pause
//   J          — rewind (tap once: -1s, hold or repeat: shuttle backward)
//   L          — fast-forward (tap once: +1s, repeat: shuttle forward)
//   ←  →       — frame step (approx 1/30s) when paused
//
// When paused, the user can type a note in the input below the player and
// hit Add (or Enter). The current timestamp is captured automatically.
//
// Notes list shows newest-first. Click the timestamp to jump back to it.
// Editors / admins can mark each note done. Clients can delete their own.
// "Send review request" emails the assigned editor.

import { useEffect, useRef, useState } from "react";

interface Note {
  id: string;
  timeSeconds: number;
  text: string;
  status: "open" | "done";
  createdByEmail: string;
  createdByName: string;
  createdAt: number;
  doneAt?: number;
}

interface Revisions {
  status: "open" | "in_review" | "completed";
  notes: Note[];
  reviewSentAt?: number;
  assignedEditorEmail?: string;
}

type Props = {
  fileId: string;
  fileUrl: string;
  fileLabel: string;
  // Role determines edit permissions on each note
  canMarkDone: boolean;
  currentEmail: string;
};

function fmtTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "—";
  const total = Math.round(seconds * 100) / 100;
  const m = Math.floor(total / 60);
  const s = total % 60;
  const ms = Math.floor((s - Math.floor(s)) * 100);
  return `${m}:${String(Math.floor(s)).padStart(2, "0")}.${String(ms).padStart(2, "0")}`;
}

function fmtAge(ms: number): string {
  const diff = (Date.now() - ms) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function VideoReviewer({
  fileId,
  fileUrl,
  fileLabel,
  canMarkDone,
  currentEmail,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const [revisions, setRevisions] = useState<Revisions | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [paused, setPaused] = useState(true);
  const [noteText, setNoteText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<{
    sent: boolean;
    recipient?: string;
    message?: string;
  } | null>(null);

  // Load revisions on mount + when file changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const r = await fetch(`/api/revisions/${fileId}`);
        const data = await r.json();
        if (!cancelled) setRevisions(data.revisions);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  // Time tracking
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    function onTime() {
      setCurrentTime(v?.currentTime ?? 0);
    }
    function onPlay() {
      setPaused(false);
    }
    function onPause() {
      setPaused(true);
    }
    function onMeta() {
      setDuration(v?.duration ?? 0);
    }
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("loadedmetadata", onMeta);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("loadedmetadata", onMeta);
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Only intercept when not typing in an input/textarea
      const target = e.target as HTMLElement;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }
      // Only when the player container is in the viewport / focused area
      const wrap = wrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      const inView = rect.top < window.innerHeight && rect.bottom > 0;
      if (!inView) return;
      const v = videoRef.current;
      if (!v) return;

      if (e.key === " " || e.key === "k" || e.key === "K") {
        e.preventDefault();
        if (v.paused) void v.play();
        else v.pause();
      } else if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        // Step back. Shuttle behavior: if already paused, big step; if
        // playing, ramp playbackRate down then negative isn't supported,
        // so we just rewind a chunk on each press.
        v.currentTime = Math.max(0, v.currentTime - (v.paused ? 2 : 5));
      } else if (e.key === "l" || e.key === "L") {
        e.preventDefault();
        v.currentTime = Math.min(
          v.duration || Number.MAX_SAFE_INTEGER,
          v.currentTime + (v.paused ? 2 : 5),
        );
      } else if (e.key === "ArrowLeft") {
        if (v.paused) {
          e.preventDefault();
          v.currentTime = Math.max(0, v.currentTime - 1 / 30);
        }
      } else if (e.key === "ArrowRight") {
        if (v.paused) {
          e.preventDefault();
          v.currentTime = Math.min(
            v.duration || Number.MAX_SAFE_INTEGER,
            v.currentTime + 1 / 30,
          );
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function seekTo(t: number) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, t);
    if (v.paused) void v.play().catch(() => {});
    v.pause();
  }

  async function addNote() {
    const text = noteText.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/revisions/${fileId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, timeSeconds: currentTime }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Could not add note");
        return;
      }
      setRevisions(data.revisions);
      setNoteText("");
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  async function toggleDone(note: Note) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/revisions/${fileId}/notes/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: note.status === "done" ? "open" : "done",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Could not update note");
        return;
      }
      setRevisions(data.revisions);
    } finally {
      setBusy(false);
    }
  }

  async function deleteNote(note: Note) {
    if (!confirm("Delete this note?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/revisions/${fileId}/notes/${note.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Could not delete note");
        return;
      }
      setRevisions(data.revisions);
    } finally {
      setBusy(false);
    }
  }

  async function sendReview() {
    setBusy(true);
    setError(null);
    setSendResult(null);
    try {
      const res = await fetch(`/api/revisions/${fileId}/send`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || `Send failed (${res.status})`);
        return;
      }
      setRevisions(data.revisions);
      setSendResult({
        sent: data.sent,
        recipient: data.recipient,
        message: data.message,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const notes = revisions?.notes ?? [];
  const openCount = notes.filter((n) => n.status === "open").length;
  const doneCount = notes.filter((n) => n.status === "done").length;

  return (
    <div
      ref={wrapRef}
      className="bg-bg-elev border border-border rounded-[16px] p-4 mb-4"
      tabIndex={-1}
    >
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h2 className="text-[14px] font-semibold">Review · {fileLabel}</h2>
          <p className="text-[12px] text-text-muted">
            Space/K play · J/L shuttle · ←/→ step a frame while paused.
          </p>
        </div>
        {revisions ? (
          <div className="flex items-center gap-2 text-[11px] flex-wrap">
            <span className="px-2 py-0.5 rounded-full bg-bg-elev-3 border border-border">
              {openCount} open
            </span>
            <span className="px-2 py-0.5 rounded-full bg-bg-elev-3 border border-border">
              {doneCount} done
            </span>
            <span
              className={`px-2 py-0.5 rounded-full ${
                revisions.status === "completed"
                  ? "bg-[rgba(16,185,129,0.12)] text-[#34d399]"
                  : revisions.status === "in_review"
                    ? "bg-[rgba(245,158,11,0.12)] text-[#fbbf24]"
                    : "bg-bg-elev-3 text-text-muted"
              }`}
            >
              {revisions.status}
            </span>
          </div>
        ) : null}
      </div>

      <video
        ref={videoRef}
        src={fileUrl}
        controls
        preload="metadata"
        crossOrigin="anonymous"
        className="w-full rounded-[10px] bg-black"
      />

      {/* Add-note row */}
      <div className="mt-3 flex items-end gap-2 flex-wrap">
        <div className="flex-1 min-w-[280px]">
          <label className="text-[11px] text-text-muted">
            Note @ <code className="text-accent-2">{fmtTime(currentTime)}</code>
            {!paused ? (
              <span className="text-text-dim ml-1">(pause to add)</span>
            ) : null}
          </label>
          <textarea
            ref={inputRef}
            rows={2}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Trim the intro · fix the lower-third typo · etc."
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void addNote();
              }
            }}
            className="mt-1 w-full px-3 py-2 bg-bg-elev-2 border border-border rounded-[10px] text-[13px]"
          />
        </div>
        <button
          onClick={addNote}
          disabled={busy || !noteText.trim()}
          className="px-4 py-2 rounded-[10px] bg-accent text-white text-[13px] disabled:opacity-50"
        >
          Add note
        </button>
      </div>

      {/* Notes list */}
      <div className="mt-4">
        {loading ? (
          <p className="text-[12px] text-text-muted">Loading…</p>
        ) : notes.length === 0 ? (
          <p className="text-[12px] text-text-muted">
            No notes yet. Pause the video at a problem spot and add one.
          </p>
        ) : (
          <ul className="space-y-2">
            {notes.map((n) => (
              <li
                key={n.id}
                className={`flex items-start gap-3 px-3 py-2 rounded-[10px] border ${
                  n.status === "done"
                    ? "bg-bg-elev-2 border-border opacity-70"
                    : "bg-bg-elev-2 border-border"
                }`}
              >
                <button
                  onClick={() => seekTo(n.timeSeconds)}
                  className="text-[11px] font-mono px-2 py-1 rounded-[6px] bg-bg-elev-3 border border-border shrink-0"
                  title="Jump to this time"
                >
                  {n.timeSeconds >= 0 ? fmtTime(n.timeSeconds) : "—"}
                </button>
                <div className="flex-1 min-w-0">
                  <div
                    className={`text-[13px] ${n.status === "done" ? "line-through text-text-muted" : ""}`}
                  >
                    {n.text}
                  </div>
                  <div className="text-[10px] text-text-dim mt-0.5">
                    {n.createdByName} · {fmtAge(n.createdAt)}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {canMarkDone ? (
                    <button
                      onClick={() => toggleDone(n)}
                      disabled={busy}
                      className={`px-2.5 py-1 rounded-[6px] text-[11px] disabled:opacity-50 ${
                        n.status === "done"
                          ? "bg-bg-elev-3 border border-border"
                          : "bg-accent-2 text-bg"
                      }`}
                    >
                      {n.status === "done" ? "Reopen" : "✓ Done"}
                    </button>
                  ) : null}
                  {n.createdByEmail === currentEmail || canMarkDone ? (
                    <button
                      onClick={() => deleteNote(n)}
                      disabled={busy}
                      className="px-2.5 py-1 rounded-[6px] bg-bg-elev-3 border border-border text-[11px] disabled:opacity-50"
                      title="Delete note"
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error ? <p className="mt-3 text-[12px] text-danger">{error}</p> : null}

      <div className="mt-4 flex items-center gap-2 flex-wrap">
        <button
          onClick={sendReview}
          disabled={busy || notes.length === 0}
          className="px-4 py-2 rounded-[10px] bg-accent text-white text-[13px] disabled:opacity-50"
        >
          📨 Send review request
        </button>
        {revisions?.reviewSentAt ? (
          <span className="text-[11px] text-text-muted">
            Last sent {fmtAge(revisions.reviewSentAt)}
          </span>
        ) : null}
      </div>

      {sendResult ? (
        <p
          className={`mt-2 text-[12px] ${
            sendResult.sent ? "text-success" : "text-text-muted"
          }`}
        >
          {sendResult.sent
            ? `✓ Sent to ${sendResult.recipient}.`
            : sendResult.message ?? "Saved but no email sent."}
        </p>
      ) : null}
    </div>
  );
}
