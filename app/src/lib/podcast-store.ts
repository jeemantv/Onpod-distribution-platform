// File-backed RSS feed store. One show per user for now.
// Path: app/data/podcasts.json (gitignored). Replace with DB on deploy.

import fs from "fs/promises";
import path from "path";

export interface ShowConfig {
  userId: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  authorEmail: string;
  language: string; // ISO 639-1, e.g. "en"
  categoryItunes: string; // e.g. "Business"
  coverUrl: string;
  link: string;
  explicit: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Episode {
  guid: string; // stable id
  fileId: string; // base64url B2 key
  title: string;
  description: string;
  audioUrl: string; // signed B2 URL? Probably a public CDN URL — see TODO.
  audioMime: string;
  audioBytes: number;
  durationSeconds: number;
  season?: number;
  episode?: number;
  publishedAt: number;
}

interface Store {
  shows: Record<string, ShowConfig>; // keyed by slug
  episodes: Record<string, Episode[]>; // keyed by slug
}

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "podcasts.json");

async function read(): Promise<Store> {
  try {
    const text = await fs.readFile(FILE, "utf8");
    return JSON.parse(text) as Store;
  } catch {
    return { shows: {}, episodes: {} };
  }
}

async function write(s: Store): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(s, null, 2));
}

export async function getShowByUser(userId: string): Promise<ShowConfig | null> {
  const s = await read();
  return (
    Object.values(s.shows).find((sh) => sh.userId === userId) ?? null
  );
}

export async function getShowBySlug(slug: string): Promise<ShowConfig | null> {
  const s = await read();
  return s.shows[slug] ?? null;
}

export async function upsertShow(config: ShowConfig): Promise<ShowConfig> {
  const s = await read();
  s.shows[config.slug] = { ...config, updatedAt: Date.now() };
  await write(s);
  return s.shows[config.slug];
}

export async function getEpisodes(slug: string): Promise<Episode[]> {
  const s = await read();
  return s.episodes[slug] ?? [];
}

export async function addEpisode(slug: string, ep: Episode): Promise<Episode[]> {
  const s = await read();
  const list = s.episodes[slug] ?? [];
  // Replace if same guid already exists
  const idx = list.findIndex((e) => e.guid === ep.guid);
  if (idx >= 0) list[idx] = ep;
  else list.unshift(ep);
  s.episodes[slug] = list;
  await write(s);
  return list;
}
