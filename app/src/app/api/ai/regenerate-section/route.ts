import { NextResponse } from "next/server";
import { decodeFileId } from "@/lib/b2";
import { regenerateField, type AIPackage } from "@/lib/claude";
import { getAI, getTranscript, saveAI } from "@/lib/transcript-store";
import { getSession } from "@/lib/session";

const VALID_FIELDS: ReadonlyArray<keyof AIPackage> = [
  "title",
  "description",
  "tags",
  "hashtags",
  "chapters",
  "summary",
] as const;

export async function POST(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { fileId, field, customPrompt } = (await req.json()) as {
    fileId: string;
    field: keyof AIPackage;
    customPrompt?: string;
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

  const transcript = await getTranscript(key);
  const ai = await getAI(key);
  if (!transcript || !ai) {
    return NextResponse.json(
      { error: "not_ready", message: "Run transcription first." },
      { status: 409 },
    );
  }

  try {
    const value = await regenerateField(
      transcript.transcript,
      field,
      customPrompt,
      ai,
    );
    const updated: AIPackage = { ...ai, [field]: value };
    await saveAI(key, updated);
    return NextResponse.json({ fileId, field, value });
  } catch (err) {
    return NextResponse.json(
      { error: "claude_error", message: (err as Error).message },
      { status: 500 },
    );
  }
}
