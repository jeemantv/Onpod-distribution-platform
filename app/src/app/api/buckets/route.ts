import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createBucket, listBuckets, listItems } from "@/lib/bucket-store";

export async function GET() {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const buckets = await listBuckets(user.id);
  const withItems = await Promise.all(
    buckets.map(async (b) => ({ ...b, items: await listItems(b.id) })),
  );
  return NextResponse.json({ buckets: withItems });
}

export async function POST(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    channelId?: string;
    channelTitle?: string;
    visibility?: string;
    times?: string[];
    days?: number[];
    timezone?: string;
    titleTemplate?: string;
  };
  if (!body.name?.trim() || !body.channelId) {
    return NextResponse.json(
      { error: "missing_fields", message: "Name and a target channel are required." },
      { status: 400 },
    );
  }
  const bucket = await createBucket(user.id, {
    name: body.name.trim(),
    channelId: body.channelId,
    channelTitle: body.channelTitle ?? null,
    visibility: body.visibility,
    times: body.times,
    days: body.days,
    timezone: body.timezone,
    titleTemplate: body.titleTemplate ?? null,
  });
  return NextResponse.json({ bucket: { ...bucket, items: [] } });
}
