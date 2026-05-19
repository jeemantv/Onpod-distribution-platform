import { NextResponse } from "next/server";
import {
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { b2, bucket, publicUrl } from "@/lib/b2";
import { OPUS_TEMPLATES, previewKeyFor } from "@/lib/opus-templates";
import { getSession } from "@/lib/session";

// Direct multipart upload of a preview loop for one OpusClip template.
// Mirrors the per-project upload flow but writes to the shared
// _assets/opus-previews/ prefix.

interface InitBody {
  templateId: string;
  sizeBytes: number;
}

export async function POST(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { templateId, sizeBytes } = (await req.json()) as InitBody;
  if (!templateId || !sizeBytes) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (!OPUS_TEMPLATES.find((t) => t.id === templateId)) {
    return NextResponse.json({ error: "unknown_template" }, { status: 404 });
  }
  if (sizeBytes > 50 * 1024 * 1024) {
    return NextResponse.json(
      { error: "too_large", message: "Preview must be under 50MB" },
      { status: 413 },
    );
  }

  const key = previewKeyFor(templateId);
  const partSizeBytes = 5 * 1024 * 1024;
  const partCount = Math.max(1, Math.ceil(sizeBytes / partSizeBytes));

  const create = await b2.send(
    new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      ContentType: "video/mp4",
    }),
  );
  const uploadId = create.UploadId!;

  const parts = await Promise.all(
    Array.from({ length: partCount }, (_, i) => i + 1).map(async (partNumber) => {
      const signedUrl = await getSignedUrl(
        b2,
        new UploadPartCommand({
          Bucket: bucket,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
        }),
        { expiresIn: 60 * 60 },
      );
      return { partNumber, signedUrl };
    }),
  );

  return NextResponse.json({
    uploadId,
    key,
    parts,
    partSizeBytes,
  });
}

interface CompleteBody {
  templateId: string;
  uploadId: string;
  parts: { partNumber: number; etag: string }[];
}

export async function PUT(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { templateId, uploadId, parts } = (await req.json()) as CompleteBody;
  if (!OPUS_TEMPLATES.find((t) => t.id === templateId)) {
    return NextResponse.json({ error: "unknown_template" }, { status: 404 });
  }
  const key = previewKeyFor(templateId);

  await b2.send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts
          .sort((a, b) => a.partNumber - b.partNumber)
          .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
      },
    }),
  );

  return NextResponse.json({ key, url: publicUrl(key) });
}
