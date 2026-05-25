"use client";

// Universal "💬 Feedback" trigger — sits in the TopNav for every signed-
// in user. Opens a small modal with a textarea, posts to /api/feedback
// which emails jeremy@jeeman.tv. No DB row, intentionally lightweight.

import { useState } from "react";
import { Modal } from "./Modal";

export function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [kind, setKind] = useState<"feature" | "bug" | "other">("feature");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setMessage("");
    setKind("feature");
    setDone(false);
    setError(null);
  };
  const close = () => {
    setOpen(false);
    setTimeout(reset, 200);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const page =
        typeof window !== "undefined" ? window.location.pathname : "";
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: message.trim(), page, kind }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { message?: string }).message ?? `HTTP ${res.status}`,
        );
      }
      setDone(true);
      setMessage("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Send feedback"
        title="Send feedback / feature request"
        className="hidden sm:inline-flex items-center gap-1.5 px-3 h-9 rounded-full bg-bg-elev border border-border hover:border-border-strong text-text-muted hover:text-text text-[12px] font-medium"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
        Feedback
      </button>

      {/* Mobile: icon-only since text label would push the nav. */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Send feedback"
        className="sm:hidden w-9 h-9 rounded-full bg-bg-elev border border-border hover:border-border-strong flex items-center justify-center text-text-muted hover:text-text"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      </button>

      {open ? (
        <Modal
          title="Send feedback"
          onClose={close}
          size="md"
          footer={
            <>
              <button
                onClick={close}
                className="px-4 py-2 text-text-muted hover:text-text"
              >
                {done ? "Close" : "Cancel"}
              </button>
              {!done ? (
                <button
                  onClick={submit}
                  disabled={busy || !message.trim()}
                  className="px-5 py-2.5 rounded-[10px] bg-accent text-white text-[13px] font-medium disabled:opacity-50"
                >
                  {busy ? "Sending…" : "Send"}
                </button>
              ) : (
                <button
                  onClick={reset}
                  className="px-5 py-2.5 rounded-[10px] bg-bg-elev-3 border border-border-strong text-[13px]"
                >
                  Send another
                </button>
              )}
            </>
          }
        >
          {done ? (
            <div className="p-3 rounded-[10px] bg-[rgba(16,185,129,0.1)] border border-[rgba(16,185,129,0.3)] text-[13px] text-[#34d399]">
              Sent to Jeremy. Thanks — every note actually gets read.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="inline-flex border border-border rounded-[8px] overflow-hidden text-[13px]">
                {(["feature", "bug", "other"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={
                      kind === k
                        ? "px-4 py-1.5 bg-bg-elev-3 text-text font-medium"
                        : "px-4 py-1.5 bg-bg-elev text-text-muted hover:text-text"
                    }
                  >
                    {k}
                  </button>
                ))}
              </div>
              <div>
                <label className="block text-[12px] text-text-muted mb-1">
                  Your message *
                </label>
                <textarea
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  // autoFocus removed: browser's "scroll focused into view"
                  // pushes the modal header above the viewport.
                  ref={(el) => {
                    if (el && !el.dataset.focused) {
                      // Focus without scrolling — works around the same
                      // browser behaviour without losing the convenience.
                      el.focus({ preventScroll: true });
                      el.dataset.focused = "1";
                    }
                  }}
                  placeholder={
                    kind === "bug"
                      ? "Describe what you expected vs what happened. Where in the app + steps to reproduce help a lot."
                      : kind === "feature"
                        ? "What would be useful? What's the context?"
                        : "What's on your mind?"
                  }
                  className="w-full px-3 py-2 bg-bg-elev-2 border border-border rounded-[10px] text-[13px] leading-relaxed"
                />
                <p className="text-[11px] text-text-dim mt-1">
                  We&apos;ll include your email, role, plan, and current page
                  automatically.
                </p>
              </div>
              {error ? (
                <div className="p-3 rounded-[10px] bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-[12px] text-[#f87171]">
                  {error}
                </div>
              ) : null}
            </div>
          )}
        </Modal>
      ) : null}
    </>
  );
}
