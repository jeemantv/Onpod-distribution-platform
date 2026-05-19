import type { FileItem } from "@/lib/types";

export function FileStatusBadges({ file }: { file: FileItem }) {
  const out: { label: string; cls: string }[] = [];

  for (const p of file.publishStates) {
    const platform = p.platform === "youtube" ? "YouTube" : p.platform === "spotify" ? "Spotify" : "OpusClip";
    if (p.action === "published")
      out.push({ label: `Published — ${platform}${p.vidType === "short" ? " Short" : ""}`, cls: "bg-[rgba(59,130,246,0.15)] text-info" });
    if (p.action === "scheduled")
      out.push({ label: `Scheduled — ${platform}`, cls: "bg-[rgba(245,158,11,0.15)] text-[#fbbf24]" });
    if (p.action === "draft")
      out.push({ label: `Draft — ${platform}`, cls: "bg-[rgba(154,154,163,0.12)] text-text-muted" });
  }

  if (file.approvalStatus === "approved")
    out.push({ label: "Approved", cls: "bg-[rgba(16,185,129,0.15)] text-[#34d399]" });
  if (file.approvalStatus === "pending")
    out.push({ label: "Pending review", cls: "bg-[rgba(168,85,247,0.12)] text-[#c084fc]" });
  if (file.approvalStatus === "rejected")
    out.push({ label: "Changes requested", cls: "bg-[rgba(239,68,68,0.1)] text-[#f87171]" });

  if (file.downloadCount >= 1)
    out.push({
      label: file.downloadCount === 1 ? "Downloaded" : `${file.downloadCount} downloads`,
      cls: "bg-[rgba(154,154,163,0.12)] text-text-muted",
    });

  if (out.length === 0) return null;
  return (
    <>
      {out.map((b, i) => (
        <span
          key={i}
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium tracking-wide ${b.cls}`}
        >
          <span className="w-[5px] h-[5px] rounded-full bg-current" />
          {b.label}
        </span>
      ))}
    </>
  );
}
