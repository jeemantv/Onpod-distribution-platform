// YouTube OAuth token store, backed by B2 (serverless-safe).
// One JSON file keyed by userId; one connection per user.

import { readState, writeState } from "./state-store";
import { refreshTokens, type OAuthTokens, type YouTubeChannelInfo } from "./youtube";

export interface StoredConnection {
  userId: string;
  channels: YouTubeChannelInfo[];
  activeChannelId: string;
  tokens: OAuthTokens;
  connectedAt: number;
}

const KEY = "youtube-tokens.json";

async function readAll(): Promise<Record<string, StoredConnection>> {
  return readState<Record<string, StoredConnection>>(KEY, {});
}

async function writeAll(all: Record<string, StoredConnection>): Promise<void> {
  await writeState(KEY, all);
}

export async function getConnection(
  userId: string,
): Promise<StoredConnection | null> {
  const all = await readAll();
  return all[userId] ?? null;
}

export async function saveConnection(conn: StoredConnection): Promise<void> {
  const all = await readAll();
  all[conn.userId] = conn;
  await writeAll(all);
}

export async function clearConnection(userId: string): Promise<void> {
  const all = await readAll();
  delete all[userId];
  await writeAll(all);
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
