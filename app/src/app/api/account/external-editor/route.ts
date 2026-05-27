// Client-facing endpoint: set / clear the external (guest) editor on
// the current user. Returns the guest URL so the UI can show it for
// copy-to-clipboard.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  getExternalEditor,
  revokeExternalEditor,
  setExternalEditor,
} from "@/lib/external-editor-store";

function guestUrl(req: Request, token: string): string {
  const base =
    process.env.NEXTAUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : new URL(req.url).origin);
  return `${base}/guest/${encodeURIComponent(token)}`;
}

export async function GET(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const editor = await getExternalEditor(user.id);
  if (!editor) return NextResponse.json({ editor: null });
  return NextResponse.json({
    editor: { email: editor.email, name: editor.name },
    guestUrl: guestUrl(req, editor.token),
  });
}

export async function POST(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    name?: string;
  };
  if (!body.email || !body.name) {
    return NextResponse.json(
      { error: "missing_fields", message: "Email and name are both required." },
      { status: 400 },
    );
  }
  try {
    const editor = await setExternalEditor(user.id, {
      email: body.email,
      name: body.name,
    });
    return NextResponse.json({
      editor: { email: editor.email, name: editor.name },
      guestUrl: guestUrl(req, editor.token),
    });
  } catch (err) {
    return NextResponse.json(
      { error: "save_failed", message: (err as Error).message },
      { status: 400 },
    );
  }
}

export async function DELETE() {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await revokeExternalEditor(user.id);
  return NextResponse.json({ ok: true });
}
