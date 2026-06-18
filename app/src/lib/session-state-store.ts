// Editor/admin workflow state for B2 sessions ("projects"). Sessions are
// B2 folders (n8n owns the layout), so "marked done" and "archived" are
// tracked in the DB keyed by (studioSlug, bucket, folder) rather than on
// any project row. A missing row = neither done nor archived.

import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { sessionStates, type SessionStateRow } from "./db/schema";

export interface SessionState {
  studioSlug: string;
  bucket: string;
  folder: string;
  done: boolean;
  archived: boolean;
  doneAt: string | null;
  archivedAt: string | null;
}

export function sessionKey(studioSlug: string, bucket: string, folder: string): string {
  return `${studioSlug}/${bucket}/${folder}`;
}

function toView(r: SessionStateRow): SessionState {
  return {
    studioSlug: r.studioSlug,
    bucket: r.bucket,
    folder: r.folder,
    done: r.doneAt != null,
    archived: r.archivedAt != null,
    doneAt: r.doneAt ? r.doneAt.toISOString() : null,
    archivedAt: r.archivedAt ? r.archivedAt.toISOString() : null,
  };
}

/**
 * Loads every session state row into a Map keyed by sessionKey(). The
 * "All projects" and "Archive" pages call this once and look each row up
 * locally, avoiding an N+1 across sessions.
 */
export async function getSessionStateMap(): Promise<Map<string, SessionState>> {
  const rows = await db.select().from(sessionStates);
  const map = new Map<string, SessionState>();
  for (const r of rows) {
    map.set(sessionKey(r.studioSlug, r.bucket, r.folder), toView(r));
  }
  return map;
}

export async function getSessionState(
  studioSlug: string,
  bucket: string,
  folder: string,
): Promise<SessionState | null> {
  const [r] = await db
    .select()
    .from(sessionStates)
    .where(
      and(
        eq(sessionStates.studioSlug, studioSlug),
        eq(sessionStates.bucket, bucket),
        eq(sessionStates.folder, folder),
      ),
    )
    .limit(1);
  return r ? toView(r) : null;
}

// Upsert a single field (done or archived) on the session's state row,
// creating it on first write. Unarchiving/un-done sets the timestamp to
// null but keeps the row so the other flag survives.
async function setFlag(
  studioSlug: string,
  bucket: string,
  folder: string,
  field: "doneAt" | "archivedAt",
  value: boolean,
  updatedBy: string | null,
): Promise<SessionState> {
  const ts = value ? new Date() : null;
  const [row] = await db
    .insert(sessionStates)
    .values({
      studioSlug,
      bucket,
      folder,
      [field]: ts,
      updatedBy,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [sessionStates.studioSlug, sessionStates.bucket, sessionStates.folder],
      set: { [field]: ts, updatedBy, updatedAt: new Date() },
    })
    .returning();
  return toView(row);
}

export function setSessionDone(
  studioSlug: string,
  bucket: string,
  folder: string,
  done: boolean,
  updatedBy: string | null,
): Promise<SessionState> {
  return setFlag(studioSlug, bucket, folder, "doneAt", done, updatedBy);
}

export function setSessionArchived(
  studioSlug: string,
  bucket: string,
  folder: string,
  archived: boolean,
  updatedBy: string | null,
): Promise<SessionState> {
  return setFlag(studioSlug, bucket, folder, "archivedAt", archived, updatedBy);
}
