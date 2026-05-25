// Assign an unmatched session to a client by renaming its folder so the
// email is embedded, and moving it into the studio's "clients/" bucket.
import { NextResponse } from "next/server";
import { movePrefix } from "@/lib/b2";
import {
  bucketPrefix,
  buildSessionFolder,
  parseSessionFolder,
  type StudioSlug,
} from "@/lib/studio";
import { assertStudioAccess } from "@/lib/editor-access";

export const maxDuration = 60;

interface AssignBody {
  studio: StudioSlug;
  folder: string;
  email: string;
  date?: string;
  time?: string;
}

function todayISO(): { date: string; time: string } {
  const d = new Date();
  const date = d.toISOString().slice(0, 10);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return { date, time: `${hh}:${mm}` };
}

export async function POST(req: Request) {
  const body = (await req.json()) as AssignBody;
  if (!body.folder || !body.email) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const blocked = await assertStudioAccess(body.studio);
  if (blocked) return blocked;

  const parsed = parseSessionFolder(body.folder);
  const { date, time } = todayISO();
  const newFolder = buildSessionFolder(
    body.date ?? parsed?.date ?? date,
    body.time ?? parsed?.time ?? time,
    body.email.trim().toLowerCase(),
  );

  const fromBase = `${bucketPrefix(body.studio, "unmatched")}${body.folder}/`;
  const toBase = `${bucketPrefix(body.studio, "clients")}${newFolder}/`;

  const moved = await movePrefix(fromBase, toBase);
  return NextResponse.json({ moved, folder: newFolder });
}
