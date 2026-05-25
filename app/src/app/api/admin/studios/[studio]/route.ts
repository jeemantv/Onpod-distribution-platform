// Per-studio admin endpoint — rename + change kind. Slug itself is
// immutable (changing it would orphan all the studios/{slug}/ B2 keys).
// Param is `studio` (not `slug`) to match the [studio] dynamic segment
// already used by the bucket/folder routes nested beneath.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  renameStudio,
  setStudioKind,
  getStudio,
  setStudioPaymentLink,
  type StudioKind,
} from "@/lib/studio-registry";
import { loadEditorScope } from "@/lib/editor-access";

async function adminOnly(studioSlug?: string): Promise<NextResponse | null> {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json(
      { error: "forbidden", message: "Only admins can manage studios." },
      { status: 403 },
    );
  }
  if (studioSlug) {
    const scope = await loadEditorScope(user);
    if (scope.studios !== null && !scope.studios.includes(studioSlug)) {
      return NextResponse.json(
        { error: "forbidden", message: "Not your studio." },
        { status: 403 },
      );
    }
  }
  return null;
}

export async function PATCH(
  req: Request,
  { params }: { params: { studio: string } },
) {
  const block = await adminOnly(params.studio);
  if (block) return block;
  const body = (await req.json().catch(() => null)) as {
    displayName?: string;
    kind?: StudioKind;
    paymentLinkUrl?: string | null;
  } | null;
  if (!body) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  try {
    if (body.displayName !== undefined) {
      await renameStudio(params.studio, body.displayName);
    }
    if (body.kind !== undefined) {
      const k: StudioKind = body.kind === "onpod" ? "onpod" : "external";
      await setStudioKind(params.studio, k);
    }
    if (body.paymentLinkUrl !== undefined) {
      await setStudioPaymentLink(params.studio, body.paymentLinkUrl);
    }
    const row = await getStudio(params.studio);
    return NextResponse.json({ ok: true, studio: row });
  } catch (err) {
    return NextResponse.json(
      { error: "update_failed", message: (err as Error).message },
      { status: 400 },
    );
  }
}
