// Rotating post buckets: CRUD + rotation + schedule ("due") logic.

import { and, asc, eq } from "drizzle-orm";
import { db } from "./db";
import { postBuckets, postBucketItems } from "./db/schema";

export type Bucket = typeof postBuckets.$inferSelect;
export type BucketItem = typeof postBucketItems.$inferSelect;

// ---------- Buckets ----------

export async function listBuckets(userId: string): Promise<Bucket[]> {
  return db
    .select()
    .from(postBuckets)
    .where(eq(postBuckets.userId, userId))
    .orderBy(asc(postBuckets.createdAt));
}

export async function getBucket(id: string): Promise<Bucket | null> {
  const [b] = await db.select().from(postBuckets).where(eq(postBuckets.id, id)).limit(1);
  return b ?? null;
}

export async function getActiveBuckets(): Promise<Bucket[]> {
  return db.select().from(postBuckets).where(eq(postBuckets.active, true));
}

export async function createBucket(
  userId: string,
  data: {
    name: string;
    channelId: string;
    channelTitle?: string | null;
    visibility?: string;
    times?: string[];
    days?: number[];
    timezone?: string;
    titleTemplate?: string | null;
  },
): Promise<Bucket> {
  const [b] = await db
    .insert(postBuckets)
    .values({
      userId,
      name: data.name,
      channelId: data.channelId,
      channelTitle: data.channelTitle ?? null,
      visibility: data.visibility ?? "public",
      times: data.times ?? [],
      days: data.days ?? [],
      timezone: data.timezone ?? "America/New_York",
      titleTemplate: data.titleTemplate ?? null,
    })
    .returning();
  return b;
}

export async function updateBucket(
  id: string,
  userId: string,
  patch: Partial<{
    name: string;
    channelId: string;
    channelTitle: string | null;
    visibility: string;
    times: string[];
    days: number[];
    timezone: string;
    titleTemplate: string | null;
    active: boolean;
  }>,
): Promise<void> {
  await db
    .update(postBuckets)
    .set(patch)
    .where(and(eq(postBuckets.id, id), eq(postBuckets.userId, userId)));
}

export async function deleteBucket(id: string, userId: string): Promise<void> {
  await db.delete(postBuckets).where(and(eq(postBuckets.id, id), eq(postBuckets.userId, userId)));
}

// ---------- Items ----------

export async function listItems(bucketId: string): Promise<BucketItem[]> {
  return db
    .select()
    .from(postBucketItems)
    .where(eq(postBucketItems.bucketId, bucketId))
    .orderBy(asc(postBucketItems.position), asc(postBucketItems.addedAt));
}

export async function addItems(
  bucketId: string,
  items: { fileKey: string; fileName: string }[],
): Promise<number> {
  if (items.length === 0) return 0;
  const existing = await listItems(bucketId);
  let pos = existing.length;
  let added = 0;
  for (const it of items) {
    try {
      await db
        .insert(postBucketItems)
        .values({ bucketId, fileKey: it.fileKey, fileName: it.fileName, position: pos })
        .onConflictDoNothing(); // unique (bucketId, fileKey)
      pos += 1;
      added += 1;
    } catch {
      /* duplicate — skip */
    }
  }
  return added;
}

export async function removeItem(bucketId: string, itemId: string): Promise<void> {
  await db
    .delete(postBucketItems)
    .where(and(eq(postBucketItems.id, itemId), eq(postBucketItems.bucketId, bucketId)));
}

// ---------- Rotation + post bookkeeping ----------

export async function advanceRotation(
  bucketId: string,
  newCursor: number,
  itemId: string,
): Promise<void> {
  const now = new Date();
  await db.update(postBuckets).set({ cursor: newCursor, lastPostedAt: now }).where(eq(postBuckets.id, bucketId));
  const [it] = await db
    .select({ c: postBucketItems.postCount })
    .from(postBucketItems)
    .where(eq(postBucketItems.id, itemId))
    .limit(1);
  await db
    .update(postBucketItems)
    .set({ postCount: (it?.c ?? 0) + 1, lastPostedAt: now })
    .where(eq(postBucketItems.id, itemId));
}

// Mark a schedule slot as handled so the same slot isn't reattempted this tick
// cycle (idempotency), whether or not a post happened.
export async function markSlotHandled(bucketId: string, slotKey: string): Promise<void> {
  await db.update(postBuckets).set({ lastSlotKey: slotKey }).where(eq(postBuckets.id, bucketId));
}

// ---------- Schedule ("is it due?") ----------

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
  return (h || 0) * 60 + (m || 0);
}

function localParts(now: Date, tz: string): { date: string; minutes: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  let hour = parseInt(get("hour"), 10);
  if (hour === 24) hour = 0; // some envs emit "24" at midnight
  const minutes = hour * 60 + parseInt(get("minute"), 10);
  const wd: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { date, minutes, weekday: wd[get("weekday")] ?? 0 };
}

// Returns the slot key (e.g. "2026-06-08T17:00") that is currently due and not
// yet handled, or null if nothing is due. DST-safe (works on local wall time).
export function dueSlotKey(bucket: Bucket, now: Date): string | null {
  const times = bucket.times ?? [];
  if (times.length === 0) return null;
  const { date, minutes, weekday } = localParts(now, bucket.timezone);
  if ((bucket.days ?? []).length > 0 && !bucket.days.includes(weekday)) return null;
  const passed = times
    .map((t) => ({ t, m: toMinutes(t) }))
    .filter((s) => s.m <= minutes)
    .sort((a, b) => a.m - b.m);
  if (passed.length === 0) return null;
  const slot = passed[passed.length - 1].t;
  const key = `${date}T${slot}`;
  return key !== bucket.lastSlotKey ? key : null;
}
