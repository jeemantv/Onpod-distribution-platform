import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createBucket, listBuckets, listItems, upcomingQueue, upcomingSlots } from "@/lib/bucket-store";
import { getAI } from "@/lib/transcript-store";
import { latestBucketPost } from "@/lib/publish-history-store";
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
      // Project each item to its real post time via the upcoming play queue
      // (handles both fixed rotation and shuffle).
      const slots = b.active ? upcomingSlots(b, now, Math.min(len, 60)) : [];
      const queue = b.active ? upcomingQueue(b, items, Math.min(len, 60)) : [];
      const enriched = await Promise.all(
        items.map(async (it) => {
          const ai = await getAI(it.fileKey).catch(() => null);
          const queuePos = queue.indexOf(it.id);
          return {
            ...it,
            aiTitle: ai?.title ?? null,
            aiDescription: ai?.description ?? null,
            thumbnailUrl: publicUrl(`${it.fileKey}.cover.jpg`),
            nextPostAt: queuePos >= 0 && slots[queuePos] ? slots[queuePos].toISOString() : null,
          };
        }),
      );
      const lastPost = await latestBucketPost(user.id, b.id);
      return { ...b, items: enriched, lastPost };
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
    shuffle?: boolean;
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
    shuffle: body.shuffle,
    titleTemplate: body.titleTemplate ?? null,
  });
  return NextResponse.json({ bucket: { ...bucket, items: [] } });
}
