import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { b2, bucket, decodeFileId, publicUrl } from "@/lib/b2";
import { pickThumbnailsFromContext } from "@/lib/gemini";
import { getAI, getTranscript } from "@/lib/transcript-store";
import { getSession } from "@/lib/session";

interface RequestBody {
  fileId: string;
  framesBase64: string[]; // each is a base64 JPEG (no data: prefix)
}

export async function POST(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as RequestBody;
  if (!body.fileId || !Array.isArray(body.framesBase64) || body.framesBase64.length === 0) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  let key: string;
  try {
    key = decodeFileId(body.fileId);
  } catch {
    return NextResponse.json({ error: "invalid_file_id" }, { status: 400 });
  }
  const [ownerId] = key.split("/", 1);
  if (user.role !== "admin" && ownerId !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Transcript is keyed by the B2 path (videoKey == backblaze key).
  const transcript = await getTranscript(key);
  if (!transcript || !transcript.transcript.trim()) {
    return NextResponse.json(
      {
        error: "no_transcript",
        message:
          "This episode has no transcript yet. Run transcription first, then try smart picks.",
      },
      { status: 400 },
    );
  }
  const ai = await getAI(key);

  try {
    const picks = await pickThumbnailsFromContext(
      body.framesBase64,
      transcript.transcript,
      ai?.title,
    );
    if (picks.length === 0) {
      return NextResponse.json(
        { error: "no_picks", message: "Gemini returned no usable picks" },
        { status: 500 },
      );
    }

    const thumbnails: {
      label: string;
      url: string;
      reason: string;
      headline: string;
      key: string;
    }[] = [];
    for (const p of picks) {
      const frame = body.framesBase64[p.index];
      if (!frame) continue;
      const buf = Buffer.from(frame, "base64");
      const label = `smart-${p.rank}`;
      const thumbKey = `${key}.thumb-${label}.jpg`;
      await b2.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: thumbKey,
          Body: buf,
          ContentType: "image/jpeg",
          CacheControl: "public, max-age=3600",
        }),
      );
      thumbnails.push({
        label,
        url: publicUrl(thumbKey),
        reason: p.reason,
        headline: p.headline,
        key: thumbKey,
      });
    }
    return NextResponse.json({ thumbnails });
  } catch (err) {
    return NextResponse.json(
      { error: "gemini_error", message: (err as Error).message },
      { status: 500 },
    );
  }
}
