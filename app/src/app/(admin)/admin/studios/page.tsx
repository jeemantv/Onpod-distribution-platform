import Link from "next/link";
import { requireEditorOrAdmin } from "@/lib/session";
import { summarizeStudios } from "@/lib/studio-store";
import {
  BUCKETS,
  BUCKET_LABEL,
  STUDIO_LABEL,
} from "@/lib/studio";
import { loadEditorScope, studioVisibleToEditor } from "@/lib/editor-access";

export const dynamic = "force-dynamic";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default async function StudiosPage() {
  const user = requireEditorOrAdmin();
  const scope = await loadEditorScope(user);
  const allStudios = await summarizeStudios();
  const studios = allStudios.filter((s) => studioVisibleToEditor(scope, s.slug));

  return (
    <>
      <div className="mb-8">
        <h1 className="display text-[36px]">Studios</h1>
        <p className="text-text-muted text-[13px] mt-1">
          Files from each OnPod studio, grouped into 4 buckets.
        </p>
      </div>

      {studios.length === 0 ? (
        <div className="bg-bg-elev border border-border rounded-lg p-12 text-center">
          <p className="text-text-muted text-[13px]">
            No studios assigned to you yet. Ask an admin to assign you.
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {studios.map((s) => {
          const totalBytes = BUCKETS.reduce(
            (acc, b) => acc + s.buckets[b].sizeBytes,
            0,
          );
          return (
            <Link
              key={s.slug}
              href={`/admin/studios/${s.slug}`}
              className="block bg-bg-elev border border-border rounded-[16px] p-6 hover:border-border-strong transition"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-[20px] font-semibold">
                    {STUDIO_LABEL[s.slug]}
                  </h2>
                  <p className="text-text-muted text-[12px] mt-1">
                    {formatBytes(totalBytes)} total
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[12px]">
                {BUCKETS.map((b) => (
                  <div
                    key={b}
                    className="bg-bg-elev-2 border border-border rounded-[8px] px-3 py-2"
                  >
                    <div className="text-text-muted">{BUCKET_LABEL[b]}</div>
                    <div className="text-text font-medium">
                      {s.buckets[b].sessionCount} sessions
                    </div>
                    <div className="text-text-dim text-[11px]">
                      {formatBytes(s.buckets[b].sizeBytes)}
                    </div>
                  </div>
                ))}
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
