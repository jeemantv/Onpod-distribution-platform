// Create + list shareable signup invites for a studio. Scoped admins
// can only manage invites for studios they own.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { loadEditorScope } from "@/lib/editor-access";
import {
  createStudioInvite,
  listStudioInvites,
} from "@/lib/studio-registry";

async function gate(studioSlug: string): Promise<NextResponse | null> {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json(
      { error: "forbidden", message: "Only admins can manage invites." },
      { status: 403 },
    );
  }
  const scope = await loadEditorScope(user);
  if (scope.studios !== null && !scope.studios.includes(studioSlug)) {
    return NextResponse.json(
      { error: "forbidden", message: "Not your studio." },
      { status: 403 },
    );
  }
  return null;
}

export async function GET(
  _req: Request,
  { params }: { params: { studio: string } },
) {
  const block = await gate(params.studio);
  if (block) return block;
  const invites = await listStudioInvites(params.studio);
  return NextResponse.json({ invites });
}

export async function POST(
  req: Request,
  { params }: { params: { studio: string } },
) {
  const block = await gate(params.studio);
  if (block) return block;
  const user = getSession()!;
  const body = (await req.json().catch(() => null)) as { label?: string } | null;
  try {
    const invite = await createStudioInvite({
      studioSlug: params.studio,
      label: body?.label,
      createdBy: user.id,
    });
    return NextResponse.json({ ok: true, invite });
  } catch (err) {
    return NextResponse.json(
      { error: "create_failed", message: (err as Error).message },
      { status: 400 },
    );
  }
}
