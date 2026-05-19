import { NextResponse } from "next/server";
import { decodeFileId } from "@/lib/b2";
import type { AIPackage } from "@/lib/claude";
import { getAI, saveAI } from "@/lib/transcript-store";
import { getSession } from "@/lib/session";

const VALID_FIELDS: ReadonlyArray<keyof AIPackage> = [
  "title",
  "description",
  "tags",
  "hashtags",
  "chapters",
  "summary",
  "language",
] as const;

export async function POST(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { fileId, field, value } = (await req.json()) as {
    fileId: string;
    field: keyof AIPackage;
    value: string | string[];
  };
  if (!VALID_FIELDS.includes(field)) {
    return NextResponse.json({ error: "invalid_field" }, { status: 400 });
  }

  let key: string;
  try {
    key = decodeFileId(fileId);
  } catch {
    return NextResponse.json({ error: "invalid_file_id" }, { status: 400 });
  }
  const [ownerId] = key.split("/", 1);
  if (user.role !== "admin" && ownerId !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const ai = await getAI(key);
  if (!ai) {
    return NextResponse.json(
      { error: "no_ai", message: "Run AI transcription first." },
      { status: 409 },
    );
  }

  const updated: AIPackage = { ...ai, [field]: value };
  await saveAI(key, updated);
  return NextResponse.json({ ok: true, field, value });
}
