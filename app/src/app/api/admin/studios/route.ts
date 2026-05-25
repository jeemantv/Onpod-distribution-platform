import { NextResponse } from "next/server";
import { requireEditorOrAdmin, getSession } from "@/lib/session";
import { summarizeStudios } from "@/lib/studio-store";
import { createStudio, type StudioKind } from "@/lib/studio-registry";

export const maxDuration = 30;

export async function GET() {
  requireEditorOrAdmin();
  const studios = await summarizeStudios();
  return NextResponse.json({ studios });
}

// Admin-only — create a new studio workspace. JSON 403 (not redirect)
// so the modal can render a clean error.
export async function POST(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json(
      { error: "forbidden", message: "Only admins can create studios." },
      { status: 403 },
    );
  }
  const body = (await req.json().catch(() => null)) as {
    slug?: string;
    displayName?: string;
    kind?: StudioKind;
  } | null;
  if (!body?.slug || !body?.displayName) {
    return NextResponse.json(
      { error: "invalid_body", message: "slug + displayName are required." },
      { status: 400 },
    );
  }
  const kind: StudioKind = body.kind === "onpod" ? "onpod" : "external";
  try {
    const row = await createStudio({
      slug: body.slug,
      displayName: body.displayName,
      kind,
    });
    return NextResponse.json({ ok: true, studio: row });
  } catch (err) {
    const msg = (err as Error).message;
    const status = msg.includes("duplicate") || msg.includes("unique") ? 409 : 400;
    return NextResponse.json({ error: "create_failed", message: msg }, { status });
  }
}
