import { requireEditorOrAdmin } from "@/lib/session";
import { summarizeStudios } from "@/lib/studio-store";
import { BUCKETS } from "@/lib/studio";
import { loadEditorScope, studioVisibleToEditor } from "@/lib/editor-access";
import { studioLabels } from "@/lib/studio-registry";
import { NewStudioButton } from "./_components/NewStudioButton";
import { StudiosList } from "./_components/StudiosList";

export const dynamic = "force-dynamic";

export default async function StudiosPage() {
  const user = requireEditorOrAdmin();
  const scope = await loadEditorScope(user);
  const allStudios = await summarizeStudios();
  const studios = allStudios.filter((s) => studioVisibleToEditor(scope, s.slug));
  const labels = await studioLabels();

  return (
    <>
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="display text-[36px]">Studios</h1>
          <p className="text-text-muted text-[13px] mt-1">
            One folder per studio workspace. OnPod studios are Pearl-fed; external
            studios self-upload.
          </p>
        </div>
        {user.role === "admin" ? <NewStudioButton /> : null}
      </div>

      <StudiosList
        rows={studios.map((s) => ({
          slug: s.slug,
          displayName: labels[s.slug] ?? s.slug,
          totalSessions: BUCKETS.reduce(
            (acc, b) => acc + s.buckets[b].sessionCount,
            0,
          ),
          totalBytes: BUCKETS.reduce(
            (acc, b) => acc + s.buckets[b].sizeBytes,
            0,
          ),
        }))}
      />
    </>
  );
}
