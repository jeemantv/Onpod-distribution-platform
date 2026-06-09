import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createBucket, listBuckets, listItems, upcomingSlots } from "@/lib/bucket-store";
import { getAI } from "@/lib/transcript-store";
import { publicUrl } from "@/lib/b2";

export async function GET() {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const buckets = await listBuckets(user.id);
  const now = new Date();
  const withItems = await Promise.all(
    buckets.map(async (b) => {
      const items = await listItems(b.id);
      const len = items.length;
      // Map each item to its place in the upcoming queue (rotation order from
      // the cursor) so we can show when it will actually post.
      const slots = b.active ? upcomingSlots(b, now, Math.min(len, 60)) : [];
      const enriched = await Promise.all(
        items.map(async (it, idx) => {
          const ai = await getAI(it.fileKey).catch(() => null);
          const queuePos = len ? (((idx - b.cursor) % len) + len) % len : 0;
          return {
            ...it,
            aiTitle: ai?.title ?? null,
            aiDescription: ai?.description ?? null,
            thumbnailUrl: publicUrl(`${it.fileKey}.cover.jpg`),
            nextPostAt: slots[queuePos] ? slots[queuePos].toISOString() : null,
          };
        }),
      );
      return { ...b, items: enriched };
    }),
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
    language?: string;
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
    language: body.language,
    times: body.times,
    days: body.days,
    timezone: body.timezone,
    titleTemplate: body.titleTemplate ?? null,
  });
  return NextResponse.json({ bucket: { ...bucket, items: [] } });
}
