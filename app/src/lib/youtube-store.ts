// File-backed YouTube OAuth token store. Multiple-channel-per-user supported.
// Path: app/data/youtube-tokens.json (gitignored). Replace with DB on deploy.

import fs from "fs/promises";
import path from "path";
import type { OAuthTokens, YouTubeChannelInfo } from "./youtube";
import { refreshTokens } from "./youtube";

export interface StoredConnection {
  userId: string;
  channels: YouTubeChannelInfo[];
  activeChannelId: string;
  tokens: OAuthTokens;
  connectedAt: number;
}

const DATA_DIR = path.join(process.cwd(), "data");
const TOKENS_FILE = path.join(DATA_DIR, "youtube-tokens.json");

async function readAll(): Promise<Record<string, StoredConnection>> {
  try {
    const text = await fs.readFile(TOKENS_FILE, "utf8");
    return JSON.parse(text) as Record<string, StoredConnection>;
  } catch {
    return {};
  }
}

async function writeAll(all: Record<string, StoredConnection>): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(TOKENS_FILE, JSON.stringify(all, null, 2));
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
