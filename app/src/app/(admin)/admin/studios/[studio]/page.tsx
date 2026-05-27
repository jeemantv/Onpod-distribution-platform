import Link from "next/link";
import { notFound } from "next/navigation";
import { requireEditorOrAdmin } from "@/lib/session";
import { summarizeStudios } from "@/lib/studio-store";
import {
  BUCKETS,
  BUCKET_LABEL,
} from "@/lib/studio";
import { getStudio, listStudioInvites } from "@/lib/studio-registry";
import { StudioNameEditor } from "../_components/StudioNameEditor";
import { StudioSettingsPanel } from "./_components/StudioSettingsPanel";
import { listAllUsers } from "@/lib/auth-store";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

function fmtBytes(n: number): string {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default async function StudioPage({
  params,
}: {
  params: { studio: string };
}) {
  const user = requireEditorOrAdmin();
  const studio = params.studio;
  const studioRow = await getStudio(studio);
  if (!studioRow) notFound();
  const { loadEditorScope, studioVisibleToEditor } = await import("@/lib/editor-access");
  const scope = await loadEditorScope(user);
  if (!studioVisibleToEditor(scope, studio)) notFound();
  const all = await summarizeStudios();
  const s = all.find((x) => x.slug === studio) ?? {
    slug: studio,
    buckets: {
      clients: { sessionCount: 0, sizeBytes: 0 },
      unmatched: { sessionCount: 0, sizeBytes: 0 },
      raw: { sessionCount: 0, sizeBytes: 0 },
      "to-delete": { sessionCount: 0, sizeBytes: 0 },
    },
  };

  return (
    <>
      <div className="mb-2 text-[12px] text-text-muted">
        <Link href="/admin/studios" className="hover:text-text underline">
          Studios
        </Link>{" "}
        / <span className="text-text">{studioRow.displayName}</span>
      </div>
      <div className="mb-8">
        <StudioNameEditor
          slug={studio}
          displayName={studioRow.displayName}
          canEdit={user.role === "admin"}
        />
        <p className="text-[11px] text-text-dim mt-1">
          {studioRow.kind === "onpod"
            ? "OnPod workflow — Pearl + n8n manage ingest"
            : "External workspace — clients self-upload"}
        </p>
      </div>

      {user.role === "admin" ? (
        <div className="mb-8">
          <StudioSettingsPanel
            slug={studio}
            initialDefaultEditor={studioRow.defaultEditorEmail}
            editors={(await listAllUsers())
              .filter((u) => u.role === "editor")
              .map((u) => ({
                email: u.email,
                name: `${u.firstName} ${u.lastName}`.trim() || u.email,
              }))}
            initialInvites={(await listStudioInvites(studio)).map((inv) => ({
              id: inv.id,
              token: inv.token,
              label: inv.label,
              createdAt: inv.createdAt.toISOString(),
              usedCount: inv.usedCount,
              lastUsedAt: inv.lastUsedAt ? inv.lastUsedAt.toISOString() : null,
              revokedAt: inv.revokedAt ? inv.revokedAt.toISOString() : null,
            }))}
            origin={`${headers().get("x-forwarded-proto") ?? "https"}://${headers().get("host") ?? "onpod.vercel.app"}`}
          />
        </div>
      ) : null}

      <h2 className="display text-[20px] mb-3">Buckets</h2>
      <ul className="space-y-2">
        {BUCKETS.map((b) => (
          <li key={b}>
            <Link
              href={`/admin/studios/${studio}/${b}`}
              className="group flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 sm:py-4 bg-bg-elev border border-border rounded-lg hover:border-border-strong hover:bg-bg-elev-2 transition"
            >
              <div className="w-10 h-10 rounded-md bg-bg-elev-3 flex items-center justify-center text-text-muted shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-[13px] sm:text-[14px]">
                  {BUCKET_LABEL[b]}
                </div>
                <p className="text-[11px] sm:text-[12px] text-text-muted mt-1">
                  {s.buckets[b].sessionCount} sessions · {fmtBytes(s.buckets[b].sizeBytes)}
                </p>
              </div>
              <span className="text-text-dim group-hover:text-text shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
