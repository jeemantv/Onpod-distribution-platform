// Postgres-backed podcast RSS show + episode store.

import { desc, eq } from "drizzle-orm";
import { db } from "./db";
import { podcastEpisodes, podcastShows } from "./db/schema";

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

type ShowRow = typeof podcastShows.$inferSelect;
type EpisodeRow = typeof podcastEpisodes.$inferSelect;

function toShow(r: ShowRow): ShowConfig {
  return {
    userId: r.userId,
    slug: r.slug,
    title: r.title,
    description: r.description,
    author: r.author,
    authorEmail: r.authorEmail,
    language: r.language,
    categoryItunes: r.categoryItunes,
    coverUrl: r.coverUrl,
    link: r.link,
    explicit: r.explicit,
    createdAt: r.createdAt.getTime(),
    updatedAt: r.updatedAt.getTime(),
  };
}

function toEpisode(r: EpisodeRow): Episode {
  return {
    guid: r.guid,
    fileId: r.fileId ?? "",
    title: r.title,
    description: r.description,
    audioUrl: r.audioUrl,
    audioMime: r.audioMime,
    audioBytes: r.audioBytes,
    durationSeconds: r.durationSeconds,
    season: r.season ?? undefined,
    episode: r.episode ?? undefined,
    publishedAt: r.publishedAt.getTime(),
  };
}

export async function getShowByUser(userId: string): Promise<ShowConfig | null> {
  const [r] = await db.select().from(podcastShows).where(eq(podcastShows.userId, userId)).limit(1);
  return r ? toShow(r) : null;
}

export async function getShowBySlug(slug: string): Promise<ShowConfig | null> {
  const [r] = await db.select().from(podcastShows).where(eq(podcastShows.slug, slug)).limit(1);
  return r ? toShow(r) : null;
}

export async function upsertShow(config: ShowConfig): Promise<ShowConfig> {
  const now = new Date();
  const [r] = await db
    .insert(podcastShows)
    .values({
      slug: config.slug,
      userId: config.userId,
      title: config.title,
      description: config.description,
      author: config.author,
      authorEmail: config.authorEmail,
      language: config.language,
      categoryItunes: config.categoryItunes,
      coverUrl: config.coverUrl,
      link: config.link,
      explicit: config.explicit,
      createdAt: new Date(config.createdAt),
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: podcastShows.slug,
      set: {
        title: config.title,
        description: config.description,
        author: config.author,
        authorEmail: config.authorEmail,
        language: config.language,
        categoryItunes: config.categoryItunes,
        coverUrl: config.coverUrl,
        link: config.link,
        explicit: config.explicit,
        updatedAt: now,
      },
    })
    .returning();
  return toShow(r);
}

export async function getEpisodes(slug: string): Promise<Episode[]> {
  const rows = await db
    .select()
    .from(podcastEpisodes)
    .where(eq(podcastEpisodes.showSlug, slug))
    .orderBy(desc(podcastEpisodes.publishedAt));
  return rows.map(toEpisode);
}

export async function addEpisode(slug: string, ep: Episode): Promise<Episode[]> {
  await db
    .insert(podcastEpisodes)
    .values({
      guid: ep.guid,
      showSlug: slug,
      fileId: null,
      title: ep.title,
      description: ep.description,
      audioUrl: ep.audioUrl,
      audioMime: ep.audioMime,
      audioBytes: ep.audioBytes,
      durationSeconds: ep.durationSeconds,
      season: ep.season ?? null,
      episode: ep.episode ?? null,
      publishedAt: new Date(ep.publishedAt),
    })
    .onConflictDoUpdate({
      target: podcastEpisodes.guid,
      set: {
        title: ep.title,
        description: ep.description,
        audioUrl: ep.audioUrl,
        audioMime: ep.audioMime,
        audioBytes: ep.audioBytes,
        durationSeconds: ep.durationSeconds,
        season: ep.season ?? null,
        episode: ep.episode ?? null,
        publishedAt: new Date(ep.publishedAt),
      },
    });
  return getEpisodes(slug);
}
