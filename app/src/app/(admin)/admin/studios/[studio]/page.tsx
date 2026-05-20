import Link from "next/link";
import { notFound } from "next/navigation";
import { requireEditorOrAdmin } from "@/lib/session";
import { summarizeStudios } from "@/lib/studio-store";
import {
  BUCKETS,
  BUCKET_LABEL,
  STUDIO_LABEL,
  STUDIO_SLUGS,
  type StudioSlug,
} from "@/lib/studio";

export const dynamic = "force-dynamic";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default async function StudioPage({
  params,
}: {
  params: { studio: string };
}) {
  requireEditorOrAdmin();
  if (!STUDIO_SLUGS.includes(params.studio as StudioSlug)) notFound();
  const studio = params.studio as StudioSlug;
  const all = await summarizeStudios();
  const s = all.find((x) => x.slug === studio)!;

  return (
    <>
      <div className="mb-2 text-[12px] text-text-muted">
        <Link href="/admin/studios" className="hover:text-text underline">
          Studios
        </Link>{" "}
        / <span className="text-text">{STUDIO_LABEL[studio]}</span>
      </div>
      <h1 className="display text-[32px] mb-8">{STUDIO_LABEL[studio]}</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {BUCKETS.map((b) => (
          <Link
            key={b}
            href={`/admin/studios/${studio}/${b}`}
            className="block bg-bg-elev border border-border rounded-[16px] p-6 hover:border-border-strong"
          >
            <h2 className="text-[18px] font-semibold">{BUCKET_LABEL[b]}</h2>
            <p className="text-text-muted text-[12px] mt-1">
              {s.buckets[b].sessionCount} sessions ·{" "}
              {formatBytes(s.buckets[b].sizeBytes)}
            </p>
          </Link>
        ))}
      </div>
    </>
  );
}
