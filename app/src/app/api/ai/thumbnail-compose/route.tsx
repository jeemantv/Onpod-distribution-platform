// Server-side thumbnail compositor. Renders a 1280×720 PNG using next/og
// (Satori) with the picked frame as background and a title/subtitle
// overlay, then mirrors it into B2 next to the source.
//
// Why next/og: it's built into Next 14, runs on Edge, supports background
// image URLs and emoji, and renders crisp typography without shipping any
// canvas/sharp/node-canvas bundles to the serverless function.

import { ImageResponse } from "next/og";
import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { b2, bucket, decodeFileId, publicUrl } from "@/lib/b2";
import { canAccessKey } from "@/lib/access";
import { requireSession } from "@/lib/session";

export const maxDuration = 60;

interface Body {
  fileId: string;
  frameUrl: string;
  title: string;
  subtitle?: string;
  accent?: string;
  slug?: string;
}

function safeSlug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "cover"
  );
}

export async function POST(req: Request) {
  const user = requireSession();
  const body = (await req.json()) as Body;
  if (!body.fileId || !body.frameUrl || !body.title) {
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

  const accent = body.accent ?? "#ff3b30";
  const subtitle = body.subtitle ?? "";

  try {
    const image = new ImageResponse(
      (
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            display: "flex",
            backgroundColor: "#0a0a0b",
            color: "white",
            fontFamily:
              "system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif",
          }}
        >
          {/* Background frame */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={body.frameUrl}
            alt=""
            width={1280}
            height={720}
            style={{
              position: "absolute",
              inset: 0,
              objectFit: "cover",
              width: "1280px",
              height: "720px",
            }}
          />
          {/* Bottom-up gradient for legibility */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0.92) 100%)",
            }}
          />
          {/* Accent bar */}
          <div
            style={{
              position: "absolute",
              left: "64px",
              bottom: "260px",
              width: "120px",
              height: "10px",
              borderRadius: "999px",
              backgroundColor: accent,
            }}
          />
          {/* Title */}
          <div
            style={{
              position: "absolute",
              left: "64px",
              right: "64px",
              bottom: subtitle ? "110px" : "70px",
              fontSize: 88,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              textShadow: "0 4px 22px rgba(0,0,0,0.55)",
              display: "flex",
            }}
          >
            {body.title}
          </div>
          {subtitle ? (
            <div
              style={{
                position: "absolute",
                left: "64px",
                right: "64px",
                bottom: "50px",
                fontSize: 36,
                fontWeight: 500,
                color: "rgba(255,255,255,0.82)",
                letterSpacing: "-0.005em",
                textShadow: "0 2px 16px rgba(0,0,0,0.6)",
                display: "flex",
              }}
            >
              {subtitle}
            </div>
          ) : null}
        </div>
      ),
      { width: 1280, height: 720 },
    );

    const buf = Buffer.from(await image.arrayBuffer());
    const slug = safeSlug(body.slug ?? "thumb");
    const thumbKey = `${key}.cover-${slug}.png`;
    await b2.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: thumbKey,
        Body: buf,
        ContentType: "image/png",
        CacheControl: "public, max-age=3600",
      }),
    );
    return NextResponse.json({
      key: thumbKey,
      url: publicUrl(thumbKey),
      bytes: buf.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "compose_error", message: (err as Error).message },
      { status: 500 },
    );
  }
}
