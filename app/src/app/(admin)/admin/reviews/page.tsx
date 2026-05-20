import Link from "next/link";
import { requireEditorOrAdmin } from "@/lib/session";
import { loadEditorScope } from "@/lib/editor-access";
import { listReviewsForStudios } from "@/lib/reviews-index";
import { STUDIO_LABEL, STUDIO_SLUGS, parseSessionFolder } from "@/lib/studio";

export const dynamic = "force-dynamic";

function fmtAge(ms: number): string {
  const diff = (Date.now() - ms) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default async function ReviewsPage() {
  const user = requireEditorOrAdmin();
  const scope = await loadEditorScope(user);
  const studios = scope.studios ?? [...STUDIO_SLUGS];
  const rows = await listReviewsForStudios(studios);
  // Filter excluded clients
  const visible = rows.filter((r) =>
    !r.clientEmail || !scope.excludedClientEmails.has(r.clientEmail.toLowerCase()),
  );
  const inReview = visible.filter((r) => r.status === "in_review");
  const open = visible.filter((r) => r.status === "open");
  const completed = visible.filter((r) => r.status === "completed");

  return (
    <>
      <div className="mb-8">
        <h1 className="display text-[36px]">Reviews</h1>
        <p className="text-text-muted text-[13px] mt-1">
          Every file with revision notes across your assigned studios.
        </p>
      </div>

      {visible.length === 0 ? (
        <div className="bg-bg-elev border border-border rounded-lg p-12 text-center">
          <p className="text-text-muted text-[13px]">
            No revision requests yet. Clients can pause a video and add
            notes from the eye icon on each file.
          </p>
        </div>
      ) : (
        <>
          <Section title="In review" rows={inReview} />
          <Section title="Open" rows={open} />
          <Section title="Completed" rows={completed} />
        </>
      )}
    </>
  );

  function Section({
    title,
    rows: section,
  }: {
    title: string;
    rows: typeof visible;
  }) {
    if (section.length === 0) return null;
    return (
      <section className="mb-6">
        <h2 className="display text-[18px] mb-3">
          {title}{" "}
          <span className="text-text-muted text-[12px]">({section.length})</span>
        </h2>
        <ul className="space-y-2">
          {section.map((r) => {
            const parsed = parseSessionFolder(r.sessionFolder);
            const href = `/admin/studios/${r.studio}/clients/${encodeURIComponent(r.sessionFolder)}`;
            return (
              <li key={r.fileKey}>
                <Link
                  href={href}
                  className="block px-4 py-3 bg-bg-elev border border-border rounded-lg hover:border-border-strong hover:bg-bg-elev-2 transition"
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-[13px] truncate font-mono">
                        {r.filename}
                      </div>
                      <p className="text-[11px] text-text-muted mt-0.5">
                        {STUDIO_LABEL[r.studio]} ·{" "}
                        {parsed ? `${parsed.date} ${parsed.time}` : r.sessionFolder}
                        {r.clientEmail ? <> · {r.clientEmail}</> : null}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-2 py-0.5 rounded-full bg-bg-elev-3 border border-border text-[10px]">
                        {r.openCount}/{r.totalCount} open
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] ${
                          r.status === "completed"
                            ? "bg-[rgba(16,185,129,0.12)] text-[#34d399]"
                            : r.status === "in_review"
                              ? "bg-[rgba(245,158,11,0.12)] text-[#fbbf24]"
                              : "bg-bg-elev-3 text-text-muted"
                        }`}
                      >
                        {r.status}
                      </span>
                      <span className="text-[10px] text-text-dim">
                        {fmtAge(r.lastUpdate)}
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }
}
