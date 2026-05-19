import { NextResponse } from "next/server";
import { decodeFileId, encodeFileId, getDownloadUrl } from "@/lib/b2";
import {
  clearJobMarker,
  getJobMarker,
  hasAI,
  setJobMarker,
} from "@/lib/transcript-store";
import { getSession } from "@/lib/session";

// Spec §6.3 — kick off async Deepgram transcription with callback URL.
// Deepgram POSTs results to /api/transcribe/webhook when done; that handler
// saves the transcript sidecar in B2 and triggers Claude.
//
// Why callbacks instead of fire-and-forget Promises?
// On serverless hosts (Vercel/Cloudflare) the request handler is killed when
// it returns, so background Promises die. Callbacks survive deploys and
// don't burn function time waiting.

export async function POST(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { fileId } = (await req.json()) as { fileId: string };
  if (!fileId)
    return NextResponse.json({ error: "missing fileId" }, { status: 400 });

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

  if (await hasAI(key)) {
    return NextResponse.json({ status: "ready", cached: true });
  }
  const existing = await getJobMarker(key);
  if (existing) {
    return NextResponse.json({ status: existing.stage, cached: false });
  }

  const signedUrl = await getDownloadUrl(key, 60 * 60 * 6);
  const origin = new URL(req.url).origin;
  const callbackUrl = `${origin}/api/transcribe/webhook?key=${encodeFileId(key)}`;

  await setJobMarker({
    videoKey: key,
    startedAt: Date.now(),
    stage: "transcribing",
  });

  const params = new URLSearchParams({
    model: "nova-2",
    smart_format: "true",
    punctuate: "true",
    paragraphs: "true",
    detect_language: "true",
    callback: callbackUrl,
  });

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    await clearJobMarker(key);
    return NextResponse.json(
      { error: "config", message: "DEEPGRAM_API_KEY not set" },
      { status: 500 },
    );
  }

  const dgRes = await fetch(
    `https://api.deepgram.com/v1/listen?${params.toString()}`,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: signedUrl }),
    },
  );

  if (!dgRes.ok) {
    await clearJobMarker(key);
    const text = await dgRes.text();
    return NextResponse.json(
      { error: "deepgram", status: dgRes.status, message: text.slice(0, 300) },
      { status: 502 },
    );
  }
  const dgBody = (await dgRes.json()) as { request_id?: string };
  await setJobMarker({
    videoKey: key,
    startedAt: Date.now(),
    stage: "transcribing",
    requestId: dgBody.request_id,
  });

  return NextResponse.json({ status: "transcribing", requestId: dgBody.request_id });
}
