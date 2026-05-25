// Admin: upsert a Vizard template override (rename + upload preview
// image). Image bytes arrive as base64 — we re-encode to JPEG via sharp
// to keep B2 storage small, then store the key in the DB row.

import { NextResponse } from "next/server";
import sharp from "sharp";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/session";
import { b2, bucket, publicUrl } from "@/lib/b2";
import { db } from "@/lib/db";
import { vizardTemplateOverrides } from "@/lib/db/schema";

export const maxDuration = 30;

interface Body {
  templateId: string;
  name?: string;
  imageBase64?: string;
}

// Inline role check that returns JSON (not a redirect) — requireEditorOrAdmin
// triggers a 307 to /account which fetch follows, blowing up the
// client's JSON parser and hiding the real "forbidden" reason.
function gateRequest() {
  const user = getSession();
  if (!user) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  if (user.role !== "admin" && (user.role as string) !== "editor") {
    return {
      error: NextResponse.json(
        { error: "forbidden", message: "Admin/editor only — sign in as one to upload template previews." },
        { status: 403 },
      ),
    };
  }
  return { user };
}

export async function POST(req: Request) {
  const gate = gateRequest();
  if (gate.error) return gate.error;
  const body = (await req.json()) as Body;
  if (!body.templateId) {
    return NextResponse.json({ error: "missing_templateId" }, { status: 400 });
  }

  let previewKey: string | undefined;
  if (body.imageBase64) {
    try {
      // Resize to 720px max, JPEG @ 85 — small enough for fast loads,
      // big enough that the picker card looks sharp.
      const raw = Buffer.from(body.imageBase64, "base64");
      const out = await sharp(raw)
        .resize({ width: 720, withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
      previewKey = `_state/vizard-templates/${body.templateId}.jpg`;
      await b2.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: previewKey,
          Body: out,
          ContentType: "image/jpeg",
          CacheControl: "public, max-age=600",
        }),
      );
    } catch (err) {
      return NextResponse.json(
        { error: "image_processing_failed", message: (err as Error).message },
        { status: 500 },
      );
    }
  }

  const setFields: Partial<typeof vizardTemplateOverrides.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (body.name !== undefined) setFields.name = body.name.trim() || null;
  if (previewKey) setFields.previewKey = previewKey;

  await db
    .insert(vizardTemplateOverrides)
    .values({
      templateId: body.templateId,
      name: setFields.name ?? null,
      previewKey: setFields.previewKey ?? null,
    })
    .onConflictDoUpdate({
      target: vizardTemplateOverrides.templateId,
      set: setFields,
    });

  return NextResponse.json({
    templateId: body.templateId,
    previewUrl: previewKey ? publicUrl(previewKey) : null,
  });
}

export async function DELETE(req: Request) {
  const gate = gateRequest();
  if (gate.error) return gate.error;
  const templateId = new URL(req.url).searchParams.get("templateId");
  if (!templateId) {
    return NextResponse.json({ error: "missing_templateId" }, { status: 400 });
  }
  await db
    .delete(vizardTemplateOverrides)
    .where(eq(vizardTemplateOverrides.templateId, templateId));
  return NextResponse.json({ ok: true });
}
