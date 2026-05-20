// PATCH — toggle a note's status (done/open). Editor + admin can mark done.
// DELETE — remove a note (only its author or staff).

import { NextResponse } from "next/server";
import { decodeFileId } from "@/lib/b2";
import { requireSession } from "@/lib/session";
import { canAccessKey } from "@/lib/access";
import { getRevisions, saveRevisions } from "@/lib/revisions-store";

export const maxDuration = 30;

export async function PATCH(
  req: Request,
  { params }: { params: { fileId: string; noteId: string } },
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
  const body = (await req.json()) as { status?: "open" | "done" };
  const file = await getRevisions(key);
  if (!file) {
    return NextResponse.json({ error: "no_revisions" }, { status: 404 });
  }
  const idx = file.notes.findIndex((n) => n.id === params.noteId);
  if (idx < 0) {
    return NextResponse.json({ error: "note_not_found" }, { status: 404 });
  }
  if (body.status === "done") {
    file.notes[idx] = {
      ...file.notes[idx],
      status: "done",
      doneAt: Date.now(),
      doneByEmail: user.email,
    };
  } else {
    file.notes[idx] = {
      ...file.notes[idx],
      status: "open",
      doneAt: undefined,
      doneByEmail: undefined,
    };
  }
  // If all notes done, mark the file completed
  if (file.notes.every((n) => n.status === "done")) {
    file.status = "completed";
  } else if (file.status === "completed") {
    file.status = "in_review";
  }
  await saveRevisions(key, file);
  return NextResponse.json({ revisions: file });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { fileId: string; noteId: string } },
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
  const file = await getRevisions(key);
  if (!file) {
    return NextResponse.json({ error: "no_revisions" }, { status: 404 });
  }
  const note = file.notes.find((n) => n.id === params.noteId);
  if (!note) {
    return NextResponse.json({ error: "note_not_found" }, { status: 404 });
  }
  const isStaff = user.role === "admin" || (user.role as string) === "editor";
  if (note.createdByEmail !== user.email && !isStaff) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  file.notes = file.notes.filter((n) => n.id !== params.noteId);
  await saveRevisions(key, file);
  return NextResponse.json({ revisions: file });
}
