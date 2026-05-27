// DB-backed Buzzsprout credential storage. Per-user (clients have their
// own Buzzsprout account; admins/editors don't publish on behalf using
// their own creds — they impersonate the client).

import { eq } from "drizzle-orm";
import { db } from "./db";
import { users } from "./db/schema";

export interface BuzzsproutCreds {
  podcastId: string;
  token: string;
}

export async function getBuzzsproutCreds(
  userId: string,
): Promise<BuzzsproutCreds | null> {
  const [row] = await db
    .select({
      podcastId: users.buzzsproutPodcastId,
      token: users.buzzsproutToken,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row?.podcastId || !row?.token) return null;
  return { podcastId: row.podcastId, token: row.token };
}

export async function setBuzzsproutCreds(
  userId: string,
  creds: BuzzsproutCreds,
): Promise<void> {
  await db
    .update(users)
    .set({
      buzzsproutPodcastId: creds.podcastId,
      buzzsproutToken: creds.token,
    })
    .where(eq(users.id, userId));
}

export async function clearBuzzsproutCreds(userId: string): Promise<void> {
  await db
    .update(users)
    .set({ buzzsproutPodcastId: null, buzzsproutToken: null })
    .where(eq(users.id, userId));
}
