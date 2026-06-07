// Postgres-backed YouTube OAuth token store.
//
// Multi-channel: a user can connect several channels (brand accounts). Each
// connected channel carries its own tokens inside the `channels` jsonb. The
// top-level token columns mirror the ACTIVE channel's tokens so the existing
// upload paths (which read the active token) keep working unchanged.

import { eq } from "drizzle-orm";
import { db } from "./db";
import { youtubeCredentials } from "./db/schema";
import { refreshTokens, type OAuthTokens, type YouTubeChannelInfo } from "./youtube";

// A channel plus its own OAuth tokens.
export interface ChannelConnection extends YouTubeChannelInfo {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
  tokenType?: string;
}

export interface StoredConnection {
  userId: string;
  channels: ChannelConnection[];
  activeChannelId: string;
  tokens: OAuthTokens;
  connectedAt: number;
}

type DbRow = typeof youtubeCredentials.$inferSelect;

function toConnection(r: DbRow): StoredConnection {
  return {
    userId: r.userId,
    channels: r.channels,
    activeChannelId: r.activeChannelId,
    tokens: {
      accessToken: r.accessToken,
      refreshToken: r.refreshToken,
      expiresAt: r.expiresAt.getTime(),
      scope: r.scope,
      tokenType: r.tokenType,
    },
    connectedAt: r.connectedAt.getTime(),
  };
}

// Strip per-channel tokens for client responses.
export function publicChannels(channels: ChannelConnection[]): YouTubeChannelInfo[] {
  return channels.map((c) => ({
    id: c.id,
    title: c.title,
    thumbnailUrl: c.thumbnailUrl,
    subscriberCount: c.subscriberCount,
  }));
}

export async function getConnection(userId: string): Promise<StoredConnection | null> {
  const [r] = await db
    .select()
    .from(youtubeCredentials)
    .where(eq(youtubeCredentials.userId, userId))
    .limit(1);
  return r ? toConnection(r) : null;
}

export async function saveConnection(conn: StoredConnection): Promise<void> {
  await db
    .insert(youtubeCredentials)
    .values({
      userId: conn.userId,
      channels: conn.channels,
      activeChannelId: conn.activeChannelId,
      accessToken: conn.tokens.accessToken,
      refreshToken: conn.tokens.refreshToken,
      expiresAt: new Date(conn.tokens.expiresAt),
      scope: conn.tokens.scope,
      tokenType: conn.tokens.tokenType,
      connectedAt: new Date(conn.connectedAt),
    })
    .onConflictDoUpdate({
      target: youtubeCredentials.userId,
      set: {
        channels: conn.channels,
        activeChannelId: conn.activeChannelId,
        accessToken: conn.tokens.accessToken,
        refreshToken: conn.tokens.refreshToken,
        expiresAt: new Date(conn.tokens.expiresAt),
        scope: conn.tokens.scope,
        tokenType: conn.tokens.tokenType,
      },
    });
}

function attachTokens(c: YouTubeChannelInfo, t: OAuthTokens): ChannelConnection {
  return {
    ...c,
    accessToken: t.accessToken,
    refreshToken: t.refreshToken,
    expiresAt: t.expiresAt,
    scope: t.scope,
    tokenType: t.tokenType,
  };
}

// Add (or refresh) the channels from one OAuth grant, WITHOUT dropping channels
// connected earlier. The grant's channel becomes the active one.
export async function addChannelConnection(
  userId: string,
  fetched: YouTubeChannelInfo[],
  tokens: OAuthTokens,
  connectedAt: number,
): Promise<void> {
  const existing = await getConnection(userId);
  let base: ChannelConnection[] = existing?.channels ?? [];

  // Backfill the previously-active channel's entry with the old top-level
  // tokens so switching back to it still works after this new connect.
  if (existing) {
    base = base.map((c) =>
      c.id === existing.activeChannelId && !c.accessToken
        ? attachTokens(c, existing.tokens)
        : c,
    );
  }

  const newEntries = fetched.map((c) => attachTokens(c, tokens));
  const byId = new Map(base.map((c) => [c.id, c]));
  for (const e of newEntries) byId.set(e.id, e); // upsert by id

  await saveConnection({
    userId,
    channels: [...byId.values()],
    activeChannelId: fetched[0].id,
    tokens,
    connectedAt: existing?.connectedAt ?? connectedAt,
  });
}

// Make a connected channel the active one — copies its tokens to the top-level
// columns so the upload paths use them.
export async function setActiveChannel(userId: string, channelId: string): Promise<boolean> {
  const conn = await getConnection(userId);
  if (!conn) return false;
  const ch = conn.channels.find((c) => c.id === channelId);
  if (!ch) return false;
  await saveConnection({
    ...conn,
    activeChannelId: channelId,
    tokens:
      ch.accessToken && ch.refreshToken
        ? {
            accessToken: ch.accessToken,
            refreshToken: ch.refreshToken,
            expiresAt: ch.expiresAt ?? 0,
            scope: ch.scope ?? conn.tokens.scope,
            tokenType: ch.tokenType ?? conn.tokens.tokenType,
          }
        : conn.tokens,
  });
  return true;
}

// Remove one channel. If it was active, promote another; if none remain, drop
// the whole connection.
export async function removeChannel(userId: string, channelId: string): Promise<void> {
  const conn = await getConnection(userId);
  if (!conn) return;
  const remaining = conn.channels.filter((c) => c.id !== channelId);
  if (remaining.length === 0) {
    await clearConnection(userId);
    return;
  }
  if (conn.activeChannelId === channelId) {
    const next = remaining[0];
    await saveConnection({
      ...conn,
      channels: remaining,
      activeChannelId: next.id,
      tokens:
        next.accessToken && next.refreshToken
          ? {
              accessToken: next.accessToken,
              refreshToken: next.refreshToken,
              expiresAt: next.expiresAt ?? 0,
              scope: next.scope ?? conn.tokens.scope,
              tokenType: next.tokenType ?? conn.tokens.tokenType,
            }
          : conn.tokens,
    });
  } else {
    await saveConnection({ ...conn, channels: remaining });
  }
}

export async function clearConnection(userId: string): Promise<void> {
  await db.delete(youtubeCredentials).where(eq(youtubeCredentials.userId, userId));
}

export async function getFreshAccessToken(userId: string): Promise<string | null> {
  const conn = await getConnection(userId);
  if (!conn) return null;
  if (conn.tokens.expiresAt > Date.now() + 60_000) {
    return conn.tokens.accessToken;
  }
  const fresh = await refreshTokens(conn.tokens.refreshToken);
  // Write the refreshed token back to both the top-level (active) columns and
  // the active channel's entry so the per-channel store stays current.
  const channels = conn.channels.map((c) =>
    c.id === conn.activeChannelId ? attachTokens(c, fresh) : c,
  );
  await saveConnection({ ...conn, channels, tokens: fresh });
  return fresh.accessToken;
}
