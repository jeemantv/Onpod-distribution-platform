// Postgres-backed revision notes for a video file.

import { asc, eq } from "drizzle-orm";
import { db } from "./db";
import { revisionNotes, revisions } from "./db/schema";

// Kept for back-compat with code that derived note ids/keys from this suffix.
export const REVISIONS_SUFFIX = ".revisions.json";

export interface RevisionNote {
  id: string;
  timeSeconds: number;
  text: string;
  status: "open" | "done";
  createdByEmail: string;
  createdByName: string;
  createdAt: number;
  doneAt?: number;
  doneByEmail?: string;
}

export interface RevisionFile {
  status: "open" | "in_review" | "completed";
  notes: RevisionNote[];
  reviewSentAt?: number;
  assignedEditorEmail?: string;
  createdAt: number;
  updatedAt: number;
}

type RevisionRow = typeof revisions.$inferSelect;
type NoteRow = typeof revisionNotes.$inferSelect;

function noteFromRow(n: NoteRow): RevisionNote {
  return {
    id: n.id,
    timeSeconds: n.timeSeconds,
    text: n.text,
    status: n.status,
    createdByEmail: n.createdByEmail,
    createdByName: n.createdByName ?? "",
    createdAt: n.createdAt.getTime(),
    doneAt: n.doneAt ? n.doneAt.getTime() : undefined,
    doneByEmail: n.doneByEmail ?? undefined,
  };
}

function fileFromRow(r: RevisionRow, notes: NoteRow[]): RevisionFile {
  return {
    status: r.status,
    notes: notes.map(noteFromRow),
    reviewSentAt: r.reviewSentAt ? r.reviewSentAt.getTime() : undefined,
    assignedEditorEmail: r.assignedEditorEmail ?? undefined,
    createdAt: r.createdAt.getTime(),
    updatedAt: r.updatedAt.getTime(),
  };
}

export async function getRevisions(videoKey: string): Promise<RevisionFile | null> {
  const [r] = await db.select().from(revisions).where(eq(revisions.videoKey, videoKey)).limit(1);
  if (!r) return null;
  const notes = await db
    .select()
    .from(revisionNotes)
    .where(eq(revisionNotes.revisionId, r.id))
    .orderBy(asc(revisionNotes.timeSeconds), asc(revisionNotes.createdAt));
  return fileFromRow(r, notes);
}

export async function saveRevisions(videoKey: string, data: RevisionFile): Promise<void> {
  const [existing] = await db
    .select()
    .from(revisions)
    .where(eq(revisions.videoKey, videoKey))
    .limit(1);

  const now = new Date();
  let revisionId: string;
  if (existing) {
    await db
      .update(revisions)
      .set({
        status: data.status,
        assignedEditorEmail: data.assignedEditorEmail ?? null,
        reviewSentAt: data.reviewSentAt ? new Date(data.reviewSentAt) : null,
        updatedAt: now,
      })
      .where(eq(revisions.id, existing.id));
    revisionId = existing.id;
  } else {
    const [inserted] = await db
      .insert(revisions)
      .values({
        videoKey,
        status: data.status,
        assignedEditorEmail: data.assignedEditorEmail ?? null,
        reviewSentAt: data.reviewSentAt ? new Date(data.reviewSentAt) : null,
        createdAt: new Date(data.createdAt),
        updatedAt: now,
      })
      .returning({ id: revisions.id });
    revisionId = inserted.id;
  }

  // Replace the note set wholesale — the public API treats the notes array
  // as the source of truth for the whole revision.
  await db.delete(revisionNotes).where(eq(revisionNotes.revisionId, revisionId));
  if (data.notes.length > 0) {
    await db.insert(revisionNotes).values(
      data.notes.map((n) => ({
        id: n.id,
        revisionId,
        timeSeconds: n.timeSeconds,
        text: n.text,
        status: n.status,
        createdByEmail: n.createdByEmail,
        createdByName: n.createdByName || null,
        createdAt: new Date(n.createdAt),
        doneAt: n.doneAt ? new Date(n.doneAt) : null,
        doneByEmail: n.doneByEmail ?? null,
      })),
    );
  }
}

export async function deleteRevisions(videoKey: string): Promise<void> {
  await db.delete(revisions).where(eq(revisions.videoKey, videoKey));
}

export function emptyRevisions(): RevisionFile {
  const now = Date.now();
  return { status: "open", notes: [], createdAt: now, updatedAt: now };
}

export function newNoteId(): string {
  // Must be a real UUID — revision_notes.id is `uuid` in Postgres and
  // rejects any other shape. crypto.randomUUID exists in Node 19+ and all
  // modern browsers; route handlers run on the server.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Defensive fallback — generate a v4-style string by hand.
  const rnd = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${rnd(8)}-${rnd(4)}-4${rnd(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${rnd(3)}-${rnd(12)}`;
}
