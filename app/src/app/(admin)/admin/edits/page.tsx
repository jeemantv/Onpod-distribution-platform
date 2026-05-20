import Link from "next/link";
import { requireEditorOrAdmin } from "@/lib/session";
import { loadEditorScope, sessionVisibleToEditor } from "@/lib/editor-access";
import { listSessionsInBucket } from "@/lib/studio-store";
import {
  STUDIO_LABEL,
  STUDIO_SLUGS,
  parseSessionFolder,
} from "@/lib/studio";

export const dynamic = "force-dynamic";

function fmtBytes(n: number): string {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default async function EditsPage() {
  const user = requireEditorOrAdmin();
  const scope = await loadEditorScope(user);
  const studios = scope.studios ?? [...STUDIO_SLUGS];

  const allSessions: Array<{
    studio: (typeof STUDIO_SLUGS)[number];
    folder: string;
    fileCount: number;
    sizeBytes: number;
    lastModified: string | null;
  }> = [];
  for (const slug of studios) {
    const list = await listSessionsInBucket(slug, "clients");
    for (const s of list) {
      if (!sessionVisibleToEditor(scope, slug, s.folder)) continue;
      allSessions.push({
        studio: slug,
        folder: s.folder,
        fileCount: s.fileCount,
        sizeBytes: s.sizeBytes,
        lastModified: s.lastModified,
      });
    }
  }
  // Newest first
  allSessions.sort((a, b) =>
    (b.lastModified ?? "").localeCompare(a.lastModified ?? ""),
  );

  return (
    <>
      <div className="mb-8">
        <h1 className="display text-[36px]">Edits</h1>
        <p className="text-text-muted text-[13px] mt-1">
          All client sessions in studios assigned to you. Newest sessions first.
        </p>
      </div>

      {allSessions.length === 0 ? (
        <div className="bg-bg-elev border border-border rounded-lg p-12 text-center">
          <p className="text-text-muted text-[13px]">
            Nothing in your queue yet. Ask an admin to assign you a studio.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {allSessions.map((s) => {
            const parsed = parseSessionFolder(s.folder);
            return (
              <li key={`${s.studio}/${s.folder}`}>
                <Link
                  href={`/admin/studios/${s.studio}/clients/${encodeURIComponent(s.folder)}`}
                  className="block px-4 py-3 bg-bg-elev border border-border rounded-lg hover:border-border-strong hover:bg-bg-elev-2 transition"
                >
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="w-10 h-10 rounded-md bg-bg-elev-3 flex items-center justify-center text-text-muted shrink-0">
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-[13px]">
                        {parsed ? `${parsed.date} ${parsed.time}` : s.folder}{" "}
                        — {STUDIO_LABEL[s.studio]}
                      </div>
                      <p className="text-[11px] text-text-muted mt-0.5">
                        {parsed?.email ?? "—"} · {s.fileCount} files ·{" "}
                        {fmtBytes(s.sizeBytes)}
                        {s.lastModified ? (
                          <> · {new Date(s.lastModified).toLocaleDateString()}</>
                        ) : null}
                      </p>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
