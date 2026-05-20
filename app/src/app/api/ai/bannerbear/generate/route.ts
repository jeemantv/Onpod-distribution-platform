// Generate a thumbnail/cover via Bannerbear and save it next to the source
// file in B2 as `{key}.bb-{slug}.jpg`. Returns the public URL.
import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { b2, bucket, decodeFileId, publicUrl } from "@/lib/b2";
import { canAccessKey } from "@/lib/access";
import { requireSession } from "@/lib/session";
import { generateImage, type BannerbearModification } from "@/lib/bannerbear";

export const maxDuration = 60;

interface Body {
  fileId: string;
  templateId: string;
  modifications: BannerbearModification[];
  slug?: string;
}

function safeSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "cover";
}

export async function POST(req: Request) {
  const user = requireSession();
  const body = (await req.json()) as Body;
  if (!body.fileId || !body.templateId || !Array.isArray(body.modifications)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  let key: string;
  try {
    key = decodeFileId(body.fileId);
  } catch {
    return NextResponse.json({ error: "invalid_file_id" }, { status: 400 });
  }
  if (!canAccessKey(user, key)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const image = await generateImage({
      templateId: body.templateId,
      modifications: body.modifications,
    });
    const url = image.image_url_jpg ?? image.image_url ?? image.image_url_png;
    if (!url) {
      return NextResponse.json(
        { error: "no_image", message: `Bannerbear status: ${image.status}` },
        { status: 502 },
      );
    }

    // Mirror the generated image into B2 so we own it and can hand it to YouTube.
    const fetchRes = await fetch(url, { cache: "no-store" });
    if (!fetchRes.ok) {
      return NextResponse.json(
        { error: "mirror_failed", message: `fetch ${fetchRes.status}` },
        { status: 502 },
      );
    }
    const buf = Buffer.from(await fetchRes.arrayBuffer());
    const slug = safeSlug(body.slug ?? "cover");
    const thumbKey = `${key}.bb-${slug}.jpg`;
    await b2.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: thumbKey,
        Body: buf,
        ContentType: "image/jpeg",
        CacheControl: "public, max-age=3600",
      }),
    );
    // Also write to `.cover.jpg` so the YouTube modal picks this up
    // as the default thumbnail without any extra click.
    const coverKey = `${key}.cover.jpg`;
    await b2
      .send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: coverKey,
          Body: buf,
          ContentType: "image/jpeg",
          CacheControl: "public, max-age=3600",
        }),
      )
      .catch(() => {});
    return NextResponse.json({
      key: thumbKey,
      url: publicUrl(thumbKey),
      coverUrl: publicUrl(coverKey),
      sourceUrl: url,
      bytes: buf.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "bannerbear_error", message: (err as Error).message },
      { status: 500 },
    );
  }
}
