// Client-facing CRUD for account delegates. Guests can't manage the
// list — only the actual host client can add or revoke teammates.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  createDelegate,
  listDelegates,
} from "@/lib/delegates-store";

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
  // Guests can't see (or manage) the delegate list of the host client.
  if (user.guest) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const rows = await listDelegates(user.id);
  return NextResponse.json({
    delegates: rows.map((d) => ({
      id: d.id,
      email: d.email,
      name: d.name,
      label: d.label,
      createdAt: d.createdAt.toISOString(),
      guestUrl: guestUrl(req, d.token),
    })),
  });
}

export async function POST(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.guest) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    name?: string;
    label?: string;
  };
  if (!body.email || !body.name) {
    return NextResponse.json(
      { error: "missing_fields", message: "Email and name are required." },
      { status: 400 },
    );
  }
  try {
    const d = await createDelegate(user.id, {
      email: body.email,
      name: body.name,
      label: body.label,
    });
    return NextResponse.json({
      delegate: {
        id: d.id,
        email: d.email,
        name: d.name,
        label: d.label,
        createdAt: d.createdAt.toISOString(),
        guestUrl: guestUrl(req, d.token),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "create_failed", message: (err as Error).message },
      { status: 400 },
    );
  }
}
