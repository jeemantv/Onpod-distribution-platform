// Returns the connection state for the current user — does the cached
// token still validate? What's the episode count? The modal uses this
// to decide between "connected" UI and "connect first" UI.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getBuzzsproutCreds } from "@/lib/buzzsprout-store";
import { listEpisodes } from "@/lib/buzzsprout";

export async function GET() {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const creds = await getBuzzsproutCreds(user.id);
  if (!creds) {
    return NextResponse.json({ connected: false });
  }
  try {
    const episodes = await listEpisodes(creds.podcastId, creds.token);
    const recent = episodes.slice(0, 5).map((e) => ({
      id: e.id,
      title: e.title,
      publishedAt: e.published_at,
      private: e.private,
    }));
    return NextResponse.json({
      connected: true,
      podcastId: creds.podcastId,
      episodeCount: episodes.length,
      recent,
    });
  } catch (err) {
    return NextResponse.json({
      connected: true,
      podcastId: creds.podcastId,
      stale: true,
      error: (err as Error).message,
    });
  }
}
