import { NextResponse } from "next/server";
import { decodeFileId } from "@/lib/b2";
import { generateArticle, type ArticleFormat } from "@/lib/claude";
import { getAI, getTranscript, saveAI } from "@/lib/transcript-store";
import { getSession } from "@/lib/session";
import { gate } from "@/lib/plan-gate-route";

const VALID: ReadonlyArray<ArticleFormat> = [
  "linkedin",
  "wordpress",
  "medium",
  "newsletter",
  "seoBlog",
];

export async function POST(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const gated = await gate(user, "articles");
  if (gated) return gated;

  const { fileId, format } = (await req.json()) as {
    fileId: string;
    format: ArticleFormat;
  };
  if (!VALID.includes(format)) {
    return NextResponse.json({ error: "invalid_format" }, { status: 400 });
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
      { error: "not_ready", message: "Run AI transcription first." },
      { status: 409 },
    );
  }

  try {
    const markdown = await generateArticle(format, transcript.transcript, ai);
    // Persist to AI sidecar so the article survives a refresh.
    const updated = {
      ...ai,
      articlesJson: { ...(ai as { articlesJson?: Record<string, string> }).articlesJson, [format]: markdown },
    };
    await saveAI(key, updated as typeof ai);
    return NextResponse.json({ fileId, format, markdown });
  } catch (err) {
    return NextResponse.json(
      { error: "claude_error", message: (err as Error).message },
      { status: 500 },
    );
  }
}
