"use client";

import type { ApprovalStatus } from "@/lib/types";

export function ApprovalToggle({
  value,
  onChange,
  inRevision,
}: {
  value: ApprovalStatus;
  onChange: (next: ApprovalStatus) => void;
  // When the file has open revision notes from the client, the button
  // flips to "In revision" so the editor/team can see at a glance that
  // there's review work pending — even if approval status is still none.
  inRevision?: boolean;
}) {
  // Revision state wins over approval state visually.
  const cls = inRevision
    ? "bg-[rgba(245,158,11,0.12)] border-[rgba(245,158,11,0.35)] text-[#fbbf24]"
    : value === "approved"
      ? "bg-[rgba(16,185,129,0.12)] border-[rgba(16,185,129,0.3)] text-[#34d399] hover:bg-[rgba(16,185,129,0.18)]"
      : value === "pending"
        ? "bg-[rgba(168,85,247,0.1)] border-[rgba(168,85,247,0.3)] text-[#c084fc]"
        : value === "rejected"
          ? "bg-[rgba(239,68,68,0.1)] border-[rgba(239,68,68,0.3)] text-[#f87171]"
          : "bg-bg-elev-2 border-border text-text-muted hover:bg-bg-elev-3 hover:border-border-strong hover:text-text";

  const label = inRevision
    ? "In revision"
    : value === "approved"
      ? "Approved"
      : value === "pending"
        ? "Awaiting review"
        : value === "rejected"
          ? "Changes requested"
          : "Approve";

  const next: ApprovalStatus = value === "approved" ? "none" : "approved";

  return (
    <button
      onClick={() => onChange(next)}
      className={`inline-flex items-center justify-center gap-1.5 px-4 sm:px-3 py-2.5 sm:py-1.5 rounded-[8px] border text-[12px] font-medium transition shrink-0 sm:w-[170px] ${cls}`}
      title={inRevision ? "Open the file to address revision notes" : undefined}
    >
      <span className="w-[6px] h-[6px] rounded-full bg-current" />
      {label}
    </button>
  );
}
