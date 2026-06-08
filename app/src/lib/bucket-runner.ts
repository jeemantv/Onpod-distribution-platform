// Executes rotating buckets: pick the next clip, upload it to the bucket's
// YouTube channel server-side, set its cover thumbnail, record the publish,
// and advance the rotation. runDueBuckets() is what the scheduler calls.

import { getDownloadUrl } from "./b2";
import { uploadVideo, setThumbnail } from "./youtube";
import { getFreshAccessToken, setActiveChannel } from "./youtube-store";
import { recordPublish } from "./publish-history-store";
import {
  advanceRotation,
  dueSlotKey,
  getActiveBuckets,
  getBucket,
  listItems,
  markSlotHandled,
  type Bucket,
} from "./bucket-store";

function deriveTitle(bucket: Bucket, fileName: string, n: number): string {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim();
  const tmpl = bucket.titleTemplate?.trim();
  const raw = tmpl
    ? tmpl.replace(/\{title\}/gi, base).replace(/\{n\}/gi, String(n))
    : base;
  return raw.slice(0, 100) || "Clip";
}

export interface PostResult {
  posted: boolean;
  videoId?: string;
  fileName?: string;
  error?: string;
}

// Post the NEXT clip in a bucket's rotation immediately (used by the manual
// "Post next now" test button and by the scheduler).
export async function postNextFromBucket(bucket: Bucket): Promise<PostResult> {
  const items = await listItems(bucket.id);
  if (items.length === 0) return { posted: false, error: "Bucket has no clips." };

  const item = items[bucket.cursor % items.length];

  // 1. Fetch the clip bytes from B2.
  let videoBytes: Uint8Array;
  try {
    const url = await getDownloadUrl(item.fileKey, 60 * 60);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch clip ${res.status}`);
    videoBytes = new Uint8Array(await res.arrayBuffer());
  } catch (err) {
    return { posted: false, fileName: item.fileName, error: `download: ${(err as Error).message}` };
  }

  // 2. Token for the bucket's channel.
  await setActiveChannel(bucket.userId, bucket.channelId);
  const accessToken = await getFreshAccessToken(bucket.userId);
  if (!accessToken) {
    return { posted: false, fileName: item.fileName, error: "YouTube not connected / token refresh failed." };
  }

  // 3. Upload as a Short.
  const title = deriveTitle(bucket, item.fileName, item.postCount + 1);
  let videoId: string;
  try {
    const out = await uploadVideo({
      accessToken,
      videoBytes,
      contentType: "video/mp4",
      title,
      description: "",
      tags: [],
      isShort: true,
      privacyStatus: (bucket.visibility as "public" | "unlisted" | "private") ?? "public",
      publishAt: null,
    });
    videoId = out.videoId;
  } catch (err) {
    return { posted: false, fileName: item.fileName, error: `upload: ${(err as Error).message}` };
  }

  // 4. Best-effort cover thumbnail (.cover.jpg sidecar).
  try {
    const coverUrl = await getDownloadUrl(`${item.fileKey}.cover.jpg`, 60 * 60);
    const cr = await fetch(coverUrl);
    if (cr.ok) {
      const tb = new Uint8Array(await cr.arrayBuffer());
      await setThumbnail(accessToken, videoId, tb, cr.headers.get("content-type") ?? "image/jpeg");
    }
  } catch {
    /* no cover — YouTube auto-generates */
  }

  // 5. Record + advance rotation.
  await recordPublish({
    userId: bucket.userId,
    fileId: item.fileKey,
    fileKey: item.fileKey,
    fileName: item.fileName,
    platform: "youtube",
    action: "published",
    vidType: "short",
    externalId: videoId,
    externalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    scheduledFor: null,
    metadata: { channelId: bucket.channelId, bucketId: bucket.id, auto: true },
  });
  await advanceRotation(bucket.id, bucket.cursor + 1, item.id);

  return { posted: true, videoId, fileName: item.fileName };
}

// Manual single-bucket post (re-reads the bucket for a fresh cursor).
export async function postNextById(bucketId: string): Promise<PostResult> {
  const bucket = await getBucket(bucketId);
  if (!bucket) return { posted: false, error: "Bucket not found." };
  return postNextFromBucket(bucket);
}

// Scheduler entrypoint: post one clip for every bucket whose schedule slot is
// due. Marks each due slot handled so it isn't retried until the next slot.
export async function runDueBuckets(now: Date = new Date()): Promise<{
  checked: number;
  posted: { bucketId: string; videoId?: string; error?: string }[];
}> {
  const buckets = await getActiveBuckets();
  const posted: { bucketId: string; videoId?: string; error?: string }[] = [];
  for (const b of buckets) {
    const slot = dueSlotKey(b, now);
    if (!slot) continue;
    // Mark the slot handled FIRST so a slow/failed post can't be reattempted
    // every tick within the same slot window.
    await markSlotHandled(b.id, slot);
    try {
      const r = await postNextFromBucket(b);
      posted.push({ bucketId: b.id, videoId: r.videoId, error: r.posted ? undefined : r.error });
    } catch (err) {
      console.error("[bucket-runner] post failed", b.id, err);
      posted.push({ bucketId: b.id, error: (err as Error).message });
    }
  }
  return { checked: buckets.length, posted };
}
