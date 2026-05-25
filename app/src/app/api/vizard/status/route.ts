// Poll fallback — useful when the webhook hasn't fired yet. Returns our
// DB-side record, optionally enriched with the remote Vizard state.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getVizardJob } from "@/lib/vizard-job-store";
import { queryClipProject } from "@/lib/vizard";

export async function GET(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "missing_projectId" }, { status: 400 });
  }

  const stored = await getVizardJob(projectId);
  if (!stored) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (stored.userId !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Status that's already terminal — don't bother Vizard.
  if (stored.status === "succeeded" || stored.status === "failed") {
    return NextResponse.json({ job: stored });
  }

  try {
    const remote = await queryClipProject(projectId);
    return NextResponse.json({
      job: stored,
      remote: { code: remote.code, videoCount: remote.videos?.length ?? 0 },
    });
  } catch (err) {
    return NextResponse.json({
      job: stored,
      remoteError: (err as Error).message,
    });
  }
}
