// Merged Vizard template list — joins the static config from
// vizard-templates.ts with operator overrides (custom name + uploaded
// preview image) stored in the DB. The Clips modal calls this on open.

import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { db } from "@/lib/db";
import { vizardTemplateOverrides } from "@/lib/db/schema";
import { publicUrl } from "@/lib/b2";
import { VIZARD_TEMPLATES } from "@/lib/vizard-templates";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = requireSession();
  const overrides = await db.select().from(vizardTemplateOverrides);
  const overrideMap = new Map(overrides.map((o) => [o.templateId, o]));
  // Admin + editor see lock state but don't need to verify; for clients
  // we expose only `locked: boolean`, never the code itself.
  const isStaff = user.role === "admin" || (user.role as string) === "editor";

  const merged = VIZARD_TEMPLATES.map((t) => {
    const o = overrideMap.get(t.id);
    return {
      id: t.id,
      name: o?.name ?? t.name,
      previewUrl: o?.previewKey ? publicUrl(o.previewKey) : t.previewUrl ?? null,
      locked: !!o?.lockCode,
      lockCode: isStaff ? o?.lockCode ?? null : undefined,
    };
  });
  // Surface any DB-only overrides whose templateId isn't in the static
  // list — lets the admin add a brand-new template entirely through the
  // UI without editing code.
  for (const o of overrides) {
    if (!merged.find((m) => m.id === o.templateId)) {
      merged.push({
        id: o.templateId,
        name: o.name ?? o.templateId,
        previewUrl: o.previewKey ? publicUrl(o.previewKey) : null,
        locked: !!o.lockCode,
        lockCode: isStaff ? o.lockCode ?? null : undefined,
      });
    }
  }
  return NextResponse.json({ templates: merged });
}
