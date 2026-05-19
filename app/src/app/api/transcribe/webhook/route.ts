import { NextResponse } from "next/server";
import { decodeFileId } from "@/lib/b2";
import type { DeepgramResult, DeepgramParagraph } from "@/lib/deepgram";
import { formatChaptersFromParagraphs } from "@/lib/deepgram";
import { generateAIPackage } from "@/lib/claude";
import {
  clearJobMarker,
  hasAI,
  saveAI,
  saveTranscript,
  setJobMarker,
} from "@/lib/transcript-store";

// Deepgram POSTs the same JSON body it would return synchronously, when the
// callback URL is set on the original request. We don't authenticate it
// beyond the obscure callback URL containing the encoded file key; for prod
// you can add a Deepgram signing secret and verify the X-DG-Signature header.

interface DeepgramApiResponse {
  metadata?: { request_id?: string; duration?: number };
  results?: {
    channels?: Array<{
      detected_language?: string;
      alternatives?: Array<{
        transcript?: string;
        paragraphs?: {
          paragraphs?: Array<{
            start?: number;
            end?: number;
            sentences?: Array<{ text?: string; start?: number; end?: number }>;
          }>;
        };
      }>;
    }>;
  };
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const fileId = url.searchParams.get("key");
  if (!fileId) {
    return NextResponse.json({ error: "missing_key" }, { status: 400 });
  }
  let videoKey: string;
  try {
    videoKey = decodeFileId(fileId);
  } catch {
    return NextResponse.json({ error: "invalid_key" }, { status: 400 });
  }

  let data: DeepgramApiResponse;
  try {
    data = (await req.json()) as DeepgramApiResponse;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const channel = data.results?.channels?.[0];
  const alt = channel?.alternatives?.[0];
  const transcript = alt?.transcript ?? "";
  const paragraphs: DeepgramParagraph[] =
    alt?.paragraphs?.paragraphs?.map((p) => ({
      start: p.start ?? 0,
      end: p.end ?? 0,
      text: (p.sentences ?? []).map((s) => s.text ?? "").join(" ").trim(),
    })) ?? [];

  const result: DeepgramResult = {
    transcript,
    language: channel?.detected_language ?? "unknown",
    durationSeconds: data.metadata?.duration ?? 0,
    paragraphs,
    requestId: data.metadata?.request_id ?? null,
    raw: data,
  };

  try {
    await saveTranscript(videoKey, result);
  } catch (err) {
    console.error("[transcribe webhook] save transcript failed", err);
    await setJobMarker({
      videoKey,
      startedAt: Date.now(),
      stage: "transcribing",
      error: (err as Error).message,
    });
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  // Don't re-run Claude if AI sidecar already exists (idempotent webhook).
  if (await hasAI(videoKey)) {
    await clearJobMarker(videoKey);
    return NextResponse.json({ ok: true, cached: true });
  }

  await setJobMarker({
    videoKey,
    startedAt: Date.now(),
    stage: "generating",
    requestId: result.requestId ?? undefined,
  });

  try {
    const chaptersHint = formatChaptersFromParagraphs(result.paragraphs);
    const ai = await generateAIPackage(result.transcript, chaptersHint);
    await saveAI(videoKey, ai);
    await clearJobMarker(videoKey);
    return NextResponse.json({ ok: true });
  } catch (err) {
    await setJobMarker({
      videoKey,
      startedAt: Date.now(),
      stage: "generating",
      error: (err as Error).message,
    });
    console.error("[transcribe webhook] claude failed", err);
    return NextResponse.json(
      { error: "claude_failed", message: (err as Error).message },
      { status: 500 },
    );
  }
}
