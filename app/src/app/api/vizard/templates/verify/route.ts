// POST { templateId, code } → { ok: true } if the code matches the
// template's lockCode (or the template isn't locked). Returns 403 with
// a generic error otherwise — same response shape so brute-force
// distinguishing can't tell "wrong code" from "no lock set".

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/session";
import { db } from "@/lib/db";
import { vizardTemplateOverrides } from "@/lib/db/schema";

export async function POST(req: Request) {
  const user = requireSession();
  const body = (await req.json().catch(() => null)) as
    | { templateId?: string; code?: string }
    | null;
  if (!body?.templateId) {
    return NextResponse.json({ error: "missing_templateId" }, { status: 400 });
  }
  const code = body.code?.trim() ?? "";
  if (code && !/^\d{4}$/.test(code)) {
    return NextResponse.json(
      { error: "invalid_code", message: "Code must be 4 digits." },
      { status: 400 },
    );
  }

  // Staff bypass.
  if (user.role === "admin" || (user.role as string) === "editor") {
    return NextResponse.json({ ok: true });
  }

  const [row] = await db
    .select()
    .from(vizardTemplateOverrides)
    .where(eq(vizardTemplateOverrides.templateId, body.templateId))
    .limit(1);
  // No override row OR no code → template is unlocked → allow.
  if (!row || !row.lockCode) {
    return NextResponse.json({ ok: true });
  }
  if (row.lockCode === code) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json(
    { error: "wrong_code", message: "Incorrect code." },
    { status: 403 },
  );
}
