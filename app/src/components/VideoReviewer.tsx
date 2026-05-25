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
  canMarkDone: boolean;
  currentEmail: string;
  // When embedded inside a Modal (e.g. PreviewModal), the wrapper
  // already shows the title so this header can be hidden.
  hideHeader?: boolean;
  // Compact mode renders a smaller video — fits a modal nicely.
  compact?: boolean;
  // Vizard auto-generated clips don't need the revision flow — they're
  // machine output. When true, hides the notes list + "Send revision
  // request" button. Player + AI tools still work.
  hideRevisions?: boolean;
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
  hideHeader,
  compact,
  hideRevisions,
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
  // Inline edit state — note id currently being edited, plus the
  // draft text. null means no edit in progress.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

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

  async function saveEditedText(note: Note, newText: string) {
    const trimmed = newText.trim();
    if (!trimmed || trimmed === note.text) {
      setEditingId(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/revisions/${fileId}/notes/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "Could not update note");
        return;
      }
      setRevisions(data.revisions);
      setEditingId(null);
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
      className={
        hideHeader
          ? ""
          : "bg-bg-elev border border-border rounded-[16px] p-4 mb-4"
      }
      tabIndex={-1}
    >
      {hideHeader ? null : (
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
      )}

      <div className="relative">
        <video
          ref={videoRef}
          src={fileUrl}
          controls
          preload="metadata"
          crossOrigin="anonymous"
          className={`w-full rounded-[10px] bg-black ${compact ? "max-h-[50vh] object-contain" : ""}`}
        />
        {/* Timeline markers — sit on a thicker rail right under the video.
            Live playhead pip shows where currentTime is so the relationship
            between dots and the scrubber above is unambiguous. */}
        {duration > 0 ? (
          <div className="relative h-8 mt-2 mx-1">
            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[3px] rounded-full bg-bg-elev-3" />
            {/* Played-region fill */}
            <div
              className="absolute top-1/2 -translate-y-1/2 h-[3px] rounded-full bg-text-dim/40"
              style={{ left: 0, width: `${Math.min(100, (currentTime / duration) * 100)}%` }}
            />
            {/* Playhead pip */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-[2px] h-4 bg-text"
              style={{ left: `calc(${Math.min(100, (currentTime / duration) * 100)}% - 1px)` }}
            />
            {notes.map((n) => {
              if (n.timeSeconds < 0) return null;
              const pct = Math.min(100, Math.max(0, (n.timeSeconds / duration) * 100));
              return (
                <button
                  key={n.id}
                  onClick={() => seekTo(n.timeSeconds)}
                  title={`${fmtTime(n.timeSeconds)} — ${n.text}`}
                  className={`group absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 transition hover:scale-125 z-10 ${
                    n.status === "done"
                      ? "bg-bg-elev-3 border-text-dim"
                      : "bg-accent border-bg shadow"
                  }`}
                  style={{ left: `calc(${pct}% - 8px)` }}
                >
                  <span className="sr-only">
                    {fmtTime(n.timeSeconds)} — {n.text}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* Add-note row */}
      {hideRevisions ? null : (
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
            onFocus={() => {
              // Auto-pause when the user starts typing so the captured
              // timestamp matches the frame they're commenting on.
              const v = videoRef.current;
              if (v && !v.paused) v.pause();
            }}
            placeholder="Trim the intro · fix the lower-third typo · Enter to add, Shift+Enter for newline"
            onKeyDown={(e) => {
              // Enter submits; Shift+Enter (or Cmd/Ctrl+Enter) inserts a
              // newline / also submits. Most users expect Enter to send.
              if (e.key === "Enter" && !e.shiftKey) {
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
      )}

      {/* Notes list */}
      {hideRevisions ? null : (
      <div className="mt-4">
        {loading ? (
          <p className="text-[12px] text-text-muted">Loading…</p>
        ) : notes.length === 0 ? (
          <p className="text-[12px] text-text-muted">
            No notes yet. Pause the video at a problem spot and add one.
          </p>
        ) : (
          <ul className="space-y-2">
            {notes.map((n) => {
              const isMine = n.createdByEmail === currentEmail;
              const canEdit = isMine || canMarkDone;
              const isEditing = editingId === n.id;
              return (
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
                    {isEditing ? (
                      <textarea
                        autoFocus
                        rows={2}
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            setEditingId(null);
                          } else if (
                            e.key === "Enter" &&
                            (e.metaKey || e.ctrlKey)
                          ) {
                            e.preventDefault();
                            void saveEditedText(n, editingText);
                          }
                        }}
                        className="w-full px-2 py-1.5 bg-bg border border-border rounded-[6px] text-[13px]"
                      />
                    ) : (
                      <div
                        className={`text-[13px] ${
                          n.status === "done" ? "line-through text-text-muted" : ""
                        }`}
                      >
                        {n.text}
                      </div>
                    )}
                    <div className="text-[10px] text-text-dim mt-0.5">
                      {n.createdByName} · {fmtAge(n.createdAt)}
                      {isMine ? (
                        <span className="ml-1 px-1.5 py-0.5 rounded-full bg-bg-elev-3 border border-border text-[9px] uppercase">
                          you
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {canMarkDone && !isEditing ? (
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
                    {canEdit && !isEditing ? (
                      <button
                        onClick={() => {
                          setEditingId(n.id);
                          setEditingText(n.text);
                        }}
                        disabled={busy}
                        className="px-2.5 py-1 rounded-[6px] bg-bg-elev-3 border border-border text-[11px] disabled:opacity-50"
                        title="Edit this note"
                      >
                        Edit
                      </button>
                    ) : null}
                    {canEdit && isEditing ? (
                      <>
                        <button
                          onClick={() => void saveEditedText(n, editingText)}
                          disabled={busy}
                          className="px-2.5 py-1 rounded-[6px] bg-accent text-white text-[11px] disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          disabled={busy}
                          className="px-2.5 py-1 rounded-[6px] bg-bg-elev-3 border border-border text-[11px]"
                        >
                          Cancel
                        </button>
                      </>
                    ) : null}
                    {canEdit && !isEditing ? (
                      <button
                        onClick={() => deleteNote(n)}
                        disabled={busy}
                        className="px-2.5 py-1 rounded-[6px] bg-bg-elev-3 border border-border text-[11px] text-danger disabled:opacity-50"
                        title="Delete this note"
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      )}

      {error ? <p className="mt-3 text-[12px] text-danger">{error}</p> : null}
      {hideRevisions ? null : (
      <>
      {/* Send-review section starts here */}

      {/*
        Send review request is a client-only action: the client packages
        their notes and emails the assigned editor. Admin/editor never
        send reviews back to themselves — they mark notes done and upload
        a new file version instead. `canMarkDone` is the role signal:
        true → admin/editor; false → client.
      */}
      {!canMarkDone ? (
        <>
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            {(() => {
              // After a successful send, switch the button into a clear
              // "Revision requested" state. Stays green + disabled until
              // the user adds more notes (which makes the latest notes
              // newer than reviewSentAt) — then it flips back to "Send".
              const sentAt = revisions?.reviewSentAt ?? 0;
              const newestNote = notes.reduce((acc, n) => Math.max(acc, n.createdAt), 0);
              const allSent = sentAt > 0 && newestNote <= sentAt;
              if (allSent) {
                return (
                  <button
                    disabled
                    className="px-4 py-2 rounded-[10px] bg-[rgba(16,185,129,0.18)] border border-[rgba(16,185,129,0.45)] text-[#10b981] text-[13px] font-medium opacity-90"
                    title={`Revision requested ${fmtAge(sentAt)}. Add a new note to send another round.`}
                  >
                    ✓ Revision requested · {fmtAge(sentAt)}
                  </button>
                );
              }
              return (
                <button
                  onClick={sendReview}
                  disabled={busy || notes.length === 0}
                  className="px-4 py-2 rounded-[10px] bg-accent text-white text-[13px] disabled:opacity-50"
                >
                  📨 Send revision request
                </button>
              );
            })()}
            {revisions?.reviewSentAt && notes.reduce((a, n) => Math.max(a, n.createdAt), 0) > revisions.reviewSentAt ? (
              <span className="text-[11px] text-text-muted">
                New notes since last send — click to re-send.
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
        </>
      ) : revisions?.reviewSentAt ? (
        <p className="mt-4 text-[12px] text-text-muted">
          Client sent this for review {fmtAge(revisions.reviewSentAt)}. Mark
          notes done and upload a new version when you&apos;re ready.
        </p>
      ) : null}
      </>
      )}
    </div>
  );
}
