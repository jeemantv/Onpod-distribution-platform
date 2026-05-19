import type { ProjectStatus } from "@/lib/types";

const STYLES: Record<ProjectStatus, string> = {
  processing: "bg-[rgba(154,154,163,0.12)] text-text-muted",
  ready: "bg-[rgba(20,184,166,0.12)] text-accent-2",
  scheduled: "bg-[rgba(245,158,11,0.15)] text-[#fbbf24]",
  published: "bg-[rgba(59,130,246,0.15)] text-info",
};

const LABEL: Record<ProjectStatus, string> = {
  processing: "Processing",
  ready: "Ready",
  scheduled: "Scheduled",
  published: "Published",
};

export function StatusPill({ status }: { status: ProjectStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium tracking-wide ${STYLES[status]}`}
    >
      <span className="w-[6px] h-[6px] rounded-full bg-current" />
      {LABEL[status]}
    </span>
  );
}
