// Podcast (RSS) show + episode store, backed by B2 (serverless-safe).

import { readState, writeState } from "./state-store";

export interface ShowConfig {
  userId: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  authorEmail: string;
  language: string;
  categoryItunes: string;
  coverUrl: string;
  link: string;
  explicit: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Episode {
  guid: string;
  fileId: string;
  title: string;
  description: string;
  audioUrl: string;
  audioMime: string;
  audioBytes: number;
  durationSeconds: number;
  season?: number;
  episode?: number;
  publishedAt: number;
}

interface Store {
  shows: Record<string, ShowConfig>;
  episodes: Record<string, Episode[]>;
}

const KEY = "podcasts.json";

async function readStore(): Promise<Store> {
  return readState<Store>(KEY, { shows: {}, episodes: {} });
}

async function writeStore(s: Store): Promise<void> {
  await writeState(KEY, s);
}

export async function getShowByUser(userId: string): Promise<ShowConfig | null> {
  const s = await readStore();
  return Object.values(s.shows).find((sh) => sh.userId === userId) ?? null;
}

export async function getShowBySlug(slug: string): Promise<ShowConfig | null> {
  const s = await readStore();
  return s.shows[slug] ?? null;
}

export async function upsertShow(config: ShowConfig): Promise<ShowConfig> {
  const s = await readStore();
  s.shows[config.slug] = { ...config, updatedAt: Date.now() };
  await writeStore(s);
  return s.shows[config.slug];
}

export async function getEpisodes(slug: string): Promise<Episode[]> {
  const s = await readStore();
  return s.episodes[slug] ?? [];
}

export async function addEpisode(slug: string, ep: Episode): Promise<Episode[]> {
  const s = await readStore();
  const list = s.episodes[slug] ?? [];
  const idx = list.findIndex((e) => e.guid === ep.guid);
  if (idx >= 0) list[idx] = ep;
  else list.unshift(ep);
  s.episodes[slug] = list;
  await writeStore(s);
  return list;
}
