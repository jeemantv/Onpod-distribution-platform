import type { FileItem } from "@/lib/types";

export function FileStatusBadges({ file }: { file: FileItem }) {
  const out: { label: string; cls: string }[] = [];

  // Dedupe publishStates by platform+action+vidType so the same file
  // re-uploaded to YouTube doesn't render two "Published — YouTube"
  // pills. Count is appended ("Published — YouTube · 2×") when truly
  // duplicate so the multi-upload is still visible.
  const tally = new Map<string, { platform: string; action: string; vidType?: string; count: number }>();
  for (const p of file.publishStates) {
    const key = `${p.platform}:${p.action}:${p.vidType ?? ""}`;
    const existing = tally.get(key);
    if (existing) existing.count += 1;
    else tally.set(key, { platform: p.platform, action: p.action, vidType: p.vidType, count: 1 });
  }
  for (const p of tally.values()) {
    const platformLabel =
      p.platform === "youtube" ? "YouTube" : p.platform === "spotify" ? "Spotify" : "OpusClip";
    const shortSuffix = p.vidType === "short" ? " Short" : "";
    const countSuffix = p.count > 1 ? ` · ${p.count}×` : "";
    const label = `${p.action === "published" ? "Published" : p.action === "scheduled" ? "Scheduled" : "Draft"} — ${platformLabel}${shortSuffix}${countSuffix}`;
    if (p.action === "published")
      out.push({ label, cls: "bg-[rgba(59,130,246,0.15)] text-info" });
    else if (p.action === "scheduled")
      out.push({ label, cls: "bg-[rgba(245,158,11,0.15)] text-[#fbbf24]" });
    else if (p.action === "draft")
      out.push({ label, cls: "bg-[rgba(154,154,163,0.12)] text-text-muted" });
  }

  // Canonical state vocabulary:
  //   Editor uploads version → "Ready for approval" (client side)
  //   Client approves         → "Approved"
  //   Client requests revision → "In revision" (editor side)
  //   Editor uploads new ver  → back to "Ready for approval"
  if (file.approvalStatus === "approved")
    out.push({ label: "Approved", cls: "bg-[rgba(16,185,129,0.15)] text-[#34d399]" });
  if (file.approvalStatus === "pending")
    out.push({ label: "Ready for approval", cls: "bg-[rgba(168,85,247,0.12)] text-[#c084fc]" });
  if (file.approvalStatus === "rejected")
    out.push({ label: "In revision", cls: "bg-[rgba(245,158,11,0.15)] text-[#fbbf24]" });

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
