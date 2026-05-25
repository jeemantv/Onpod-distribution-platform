import { requireEditorOrAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { vizardTemplateOverrides } from "@/lib/db/schema";
import { publicUrl } from "@/lib/b2";
import { VIZARD_TEMPLATES } from "@/lib/vizard-templates";
import { VizardTemplateAdmin } from "./_components/VizardTemplateAdmin";

export const dynamic = "force-dynamic";

export default async function VizardTemplatesPage() {
  requireEditorOrAdmin();
  const overrides = await db.select().from(vizardTemplateOverrides);
  const overrideMap = new Map(overrides.map((o) => [o.templateId, o]));
  const seen = new Set(VIZARD_TEMPLATES.map((t) => t.id));

  const templates = [
    ...VIZARD_TEMPLATES.map((t) => {
      const o = overrideMap.get(t.id);
      return {
        id: t.id,
        name: o?.name ?? t.name,
        previewUrl: o?.previewKey ? publicUrl(o.previewKey) : t.previewUrl ?? null,
        sourceConfig: true,
        lockCode: o?.lockCode ?? null,
      };
    }),
    ...overrides
      .filter((o) => !seen.has(o.templateId))
      .map((o) => ({
        id: o.templateId,
        name: o.name ?? o.templateId,
        previewUrl: o.previewKey ? publicUrl(o.previewKey) : null,
        sourceConfig: false,
        lockCode: o.lockCode ?? null,
      })),
  ];

  return (
    <>
      <div className="mb-2 text-[12px] text-text-muted">
        Integrations / <span className="text-text">Vizard templates</span>
      </div>
      <h1 className="display text-[32px] mb-2">Vizard templates</h1>
      <p className="text-text-muted text-[13px] mb-6">
        Rename templates and upload preview images. Picker on the Clips modal
        reads from this list.
      </p>
      <VizardTemplateAdmin initial={templates} />
    </>
  );
}
