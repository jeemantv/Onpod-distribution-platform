// PATCH — toggle a note's status (done/open) OR edit the text. Status
//         can be flipped by editor/admin. Text can be edited by the
//         note's author or any staff.
// DELETE — remove a note (only its author or staff).

import { NextResponse } from "next/server";
import { decodeFileId } from "@/lib/b2";
import { requireSession } from "@/lib/session";
import { canAccessKey } from "@/lib/access";
import { getRevisions, saveRevisions } from "@/lib/revisions-store";

export const maxDuration = 30;

function isStaff(role: string): boolean {
  return role === "admin" || role === "editor";
}

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
  let body: { status?: "open" | "done"; text?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const file = await getRevisions(key);
  if (!file) {
    return NextResponse.json({ error: "no_revisions" }, { status: 404 });
  }
  const idx = file.notes.findIndex((n) => n.id === params.noteId);
  if (idx < 0) {
    return NextResponse.json({ error: "note_not_found" }, { status: 404 });
  }
  const note = file.notes[idx];

  // Text edit — only author or staff
  if (body.text !== undefined) {
    if (note.createdByEmail !== user.email && !isStaff(user.role)) {
      return NextResponse.json({ error: "forbidden_edit" }, { status: 403 });
    }
    const trimmed = body.text.trim();
    if (!trimmed) {
      return NextResponse.json({ error: "empty_text" }, { status: 400 });
    }
    file.notes[idx] = { ...note, text: trimmed };
  }

  // Status change — only staff (clients can't mark their own notes done)
  if (body.status !== undefined) {
    if (!isStaff(user.role)) {
      return NextResponse.json({ error: "forbidden_status" }, { status: 403 });
    }
    if (body.status === "done") {
      // Guest editor → attribute to them, not the host client.
      const actorEmail = user.guest?.email ?? user.email;
      file.notes[idx] = {
        ...file.notes[idx],
        status: "done",
        doneAt: Date.now(),
        doneByEmail: actorEmail,
      };
    } else {
      file.notes[idx] = {
        ...file.notes[idx],
        status: "open",
        doneAt: undefined,
        doneByEmail: undefined,
      };
    }
    if (file.notes.every((n) => n.status === "done")) {
      file.status = "completed";
    } else if (file.status === "completed") {
      file.status = "in_review";
    }
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
  if (note.createdByEmail !== user.email && !isStaff(user.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  file.notes = file.notes.filter((n) => n.id !== params.noteId);
  if (file.notes.length > 0 && file.notes.every((n) => n.status === "done")) {
    file.status = "completed";
  } else if (file.notes.length === 0) {
    file.status = "open";
  }
  await saveRevisions(key, file);
  return NextResponse.json({ revisions: file });
}
