"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import type { FileItem } from "@/lib/types";

export function RequestApprovalModal({
  projectId,
  shareToken,
  unapprovedFiles,
  onClose,
  onSent,
}: {
  projectId: string;
  shareToken: string;
  unapprovedFiles: FileItem[];
  onClose: () => void;
  onSent: () => void;
}) {
  const shareUrl = `https://app.onpod.io/share/${shareToken}`;
  const [to, setTo] = useState("client@example.com");
  const [subject, setSubject] = useState("Please review your podcast files");
  const [body, setBody] = useState(
    `Hi,\n\nYour latest OnPod session files are ready for review. Please open the link below to approve or request changes.\n\nFiles awaiting your review:\n${unapprovedFiles.map((f) => `  • ${f.name}`).join("\n") || "  (none)"}\n\nReview here: ${shareUrl}\n\nThanks,\nOnPod Studios`,
  );
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  void projectId;

  const send = async () => {
    setSending(true);
    setError(null);
    // 1. Flip each target file to "pending" in the DB so both client and
    //    editor see "Waiting for approval" after a reload.
    const failed: string[] = [];
    await Promise.all(
      unapprovedFiles.map(async (f) => {
        const res = await fetch(`/api/files/${f.id}/meta`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approvalStatus: "pending" }),
        }).catch(() => null);
        if (!res || !res.ok) failed.push(f.name);
      }),
    );
    // 2. Send the actual email via Resend.
    const emailRes = await fetch("/api/approvals/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        to,
        subject,
        body,
        fileNames: unapprovedFiles.map((f) => f.name),
      }),
    }).catch(() => null);
    setSending(false);
    if (failed.length > 0) {
      setError(`Could not mark ${failed.length} file${failed.length === 1 ? "" : "s"} as pending. Try again.`);
      return;
    }
    if (!emailRes || !emailRes.ok) {
      const txt = (await emailRes?.text().catch(() => "")) ?? "";
      setError(`Files were flagged but the email didn't send. ${txt.slice(0, 200)}`);
      return;
    }
    onSent();
  };

  return (
    <Modal
      title="Request approval"
      subtitle={`${unapprovedFiles.length} file${unapprovedFiles.length === 1 ? "" : "s"} will be flagged as pending`}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 text-text-muted hover:text-text">
            Cancel
          </button>
          <button
            onClick={send}
            disabled={sending || unapprovedFiles.length === 0}
            className="px-5 py-2.5 rounded-[10px] bg-accent text-white text-[13px] font-medium disabled:opacity-60"
          >
            {sending ? "Sending…" : "Send email"}
          </button>
        </>
      }
    >
      {unapprovedFiles.length === 0 ? (
        <div className="mb-4 p-3 rounded-[10px] bg-[rgba(245,158,11,0.08)] border border-[rgba(245,158,11,0.25)] text-[12px] text-[#fbbf24]">
          No files selected. Close this and tick the checkbox on each file you
          want included in the approval email, then click Request approval
          again.
        </div>
      ) : (
        <div className="mb-4 p-3 rounded-[10px] bg-bg-elev-2 border border-border text-[12px]">
          <div className="font-medium mb-1.5">
            {unapprovedFiles.length} file{unapprovedFiles.length === 1 ? "" : "s"} will be listed in the email:
          </div>
          <ul className="text-text-muted space-y-0.5">
            {unapprovedFiles.slice(0, 8).map((f) => (
              <li key={f.id} className="truncate">• {f.name}</li>
            ))}
            {unapprovedFiles.length > 8 ? (
              <li>+ {unapprovedFiles.length - 8} more</li>
            ) : null}
          </ul>
        </div>
      )}

      {error ? (
        <p className="mb-3 text-[12px] text-danger">{error}</p>
      ) : null}
      <div className="grid grid-cols-1 gap-4">
        <div>
          <label className="block text-[12px] text-text-muted mb-2">To</label>
          <input value={to} onChange={(e) => setTo(e.target.value)} className="input-req" />
        </div>
        <div>
          <label className="block text-[12px] text-text-muted mb-2">Subject</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className="input-req" />
        </div>
        <div>
          <label className="block text-[12px] text-text-muted mb-2">Body</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            className="input-req font-mono text-[12px]"
          />
        </div>
      </div>

      <style jsx>{`
        :global(.input-req) {
          width: 100%;
          padding: 10px 14px;
          background: #1c1c20;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          color: #fafafa;
          font-family: inherit;
          font-size: 13px;
        }
      `}</style>
    </Modal>
  );
}
