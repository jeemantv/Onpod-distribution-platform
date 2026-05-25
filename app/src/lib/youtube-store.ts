// Postgres-backed YouTube OAuth token store.

import { eq } from "drizzle-orm";
import { db } from "./db";
import { youtubeCredentials } from "./db/schema";
import { refreshTokens, type OAuthTokens, type YouTubeChannelInfo } from "./youtube";

export interface StoredConnection {
  userId: string;
  channels: YouTubeChannelInfo[];
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
  conn.tokens = fresh;
  await saveConnection(conn);
  return fresh.accessToken;
}
