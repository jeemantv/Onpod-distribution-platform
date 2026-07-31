import { NextResponse } from "next/server";
import { deleteJob } from "@/lib/yt-ai-store";
import { isResponse, loadOwnedJob, requireAdminApi } from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = requireAdminApi();
  if (isResponse(user)) return user;
  const job = await loadOwnedJob(params.id, user.id);
  if (isResponse(job)) return job;
  return NextResponse.json({ job });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = requireAdminApi();
  if (isResponse(user)) return user;
  const job = await loadOwnedJob(params.id, user.id);
  if (isResponse(job)) return job;
  await deleteJob(job.id);
  return NextResponse.json({ ok: true });
}
