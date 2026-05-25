import { requireEditorOrAdmin } from "@/lib/session";
import { loadEditorScope, sessionVisibleToEditor } from "@/lib/editor-access";
import { listSessionsInBucket } from "@/lib/studio-store";
import { STUDIO_LABEL, STUDIO_SLUGS, parseSessionFolder } from "@/lib/studio";
import { listAllUsers } from "@/lib/auth-store";
import { listReviewsForStudios } from "@/lib/reviews-index";
import { EditsList } from "./_components/EditsList";

export const dynamic = "force-dynamic";

export default async function EditsPage() {
  const user = requireEditorOrAdmin();
  const scope = await loadEditorScope(user);
  const studios = scope.studios ?? [...STUDIO_SLUGS];

  const [users, reviews] = await Promise.all([
    listAllUsers(),
    listReviewsForStudios(studios),
  ]);

  // Client email → assigned editor email (clients carry the field; we look
  // up by the email parsed out of the session folder name).
  const editorByClient = new Map<string, { editorEmail: string; editorName: string }>();
  const editorNameByEmail = new Map<string, string>();
  for (const u of users) {
    if (u.role === "editor" || u.role === "admin") {
      editorNameByEmail.set(
        u.email.toLowerCase(),
        `${u.firstName} ${u.lastName}`.trim() || u.email,
      );
    }
  }
  for (const u of users) {
    if (u.role !== "client" || !u.assignedEditorEmail) continue;
    const eEmail = u.assignedEditorEmail.toLowerCase();
    editorByClient.set(u.email.toLowerCase(), {
      editorEmail: eEmail,
      editorName: editorNameByEmail.get(eEmail) ?? eEmail,
    });
  }

  // Session key → aggregate review counts.
  const reviewBySession = new Map<string, { open: number; total: number }>();
  for (const r of reviews) {
    const key = `${r.studio}/${r.sessionFolder}`;
    const cur = reviewBySession.get(key) ?? { open: 0, total: 0 };
    cur.open += r.openCount;
    cur.total += r.totalCount;
    reviewBySession.set(key, cur);
  }

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

      <EditsList
        rows={allSessions.map((s) => {
          const parsed = parseSessionFolder(s.folder);
          const editor = parsed?.email
            ? editorByClient.get(parsed.email.toLowerCase())
            : undefined;
          const review = reviewBySession.get(`${s.studio}/${s.folder}`);
          return {
            studio: s.studio,
            studioLabel: STUDIO_LABEL[s.studio] ?? s.studio,
            folder: s.folder,
            parsedDate: parsed?.date,
            parsedTime: parsed?.time,
            parsedEmail: parsed?.email,
            fileCount: s.fileCount,
            sizeBytes: s.sizeBytes,
            lastModified: s.lastModified,
            editorName: editor?.editorName,
            editorEmail: editor?.editorEmail,
            reviewOpen: review?.open ?? 0,
            reviewTotal: review?.total ?? 0,
          };
        })}
      />
    </>
  );
}
