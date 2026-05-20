// GET — fetch revisions for a video file.
// POST — append a note.

import { NextResponse } from "next/server";
import { decodeFileId } from "@/lib/b2";
import { requireSession } from "@/lib/session";
import { canAccessKey } from "@/lib/access";
import {
  emptyRevisions,
  getRevisions,
  newNoteId,
  saveRevisions,
  type RevisionNote,
} from "@/lib/revisions-store";

export const maxDuration = 30;

export async function GET(
  _req: Request,
  { params }: { params: { fileId: string } },
) {
  const user = requireSession();
  let key: string;
  try {
    key = decodeFileId(params.fileId);
  } catch {
    return NextResponse.json({ error: "invalid_file_id" }, { status: 400 });
  }
  if (!canAccessKey(user, key)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const file = (await getRevisions(key)) ?? emptyRevisions();
  return NextResponse.json({ revisions: file });
}

export async function POST(
  req: Request,
  { params }: { params: { fileId: string } },
) {
  const user = requireSession();
  let key: string;
  try {
    key = decodeFileId(params.fileId);
  } catch {
    return NextResponse.json({ error: "invalid_file_id" }, { status: 400 });
  }
  if (!canAccessKey(user, key)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = (await req.json()) as { timeSeconds?: number; text?: string };
  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "empty_text" }, { status: 400 });
  }
  const file = (await getRevisions(key)) ?? emptyRevisions();
  const note: RevisionNote = {
    id: newNoteId(),
    timeSeconds: typeof body.timeSeconds === "number" ? body.timeSeconds : -1,
    text,
    status: "open",
    createdByEmail: user.email,
    createdByName: `${user.firstName} ${user.lastName}`.trim() || user.email,
    createdAt: Date.now(),
  };
  // newest first (matches the rest of the app)
  file.notes = [note, ...file.notes];
  if (file.status === "completed") file.status = "open";
  await saveRevisions(key, file);
  return NextResponse.json({ note, revisions: file });
}
