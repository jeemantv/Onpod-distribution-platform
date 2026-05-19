import { NextResponse } from "next/server";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { b2, bucket, publicUrl } from "@/lib/b2";
import { OPUS_TEMPLATES, previewKeyFor } from "@/lib/opus-templates";
import { getSession } from "@/lib/session";

async function previewUrl(templateId: string): Promise<string | null> {
  const key = previewKeyFor(templateId);
  try {
    await b2.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return publicUrl(key);
  } catch {
    return null;
  }
}

export async function GET() {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Probe B2 in parallel for all preview files
  const withPreviews = await Promise.all(
    OPUS_TEMPLATES.map(async (t) => ({
      ...t,
      previewUrl: await previewUrl(t.id),
    })),
  );
  return NextResponse.json({ templates: withPreviews });
}
