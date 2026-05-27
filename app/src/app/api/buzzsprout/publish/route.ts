// Publish a file as a Buzzsprout episode. Buzzsprout accepts a public
// audio_url (or video URL — it strips audio server-side) and handles
// distribution to Spotify / Apple / Amazon Music / etc itself.
//
// AI-prefill: we hydrate title/description/tags from the same ai_content
// row the Spotify RSS modal uses, so the client gets a one-click flow.

import { NextResponse } from "next/server";
import { decodeFileId, publicUrl } from "@/lib/b2";
import { getSession } from "@/lib/session";
import { canAccessKey } from "@/lib/access";
import { gate } from "@/lib/plan-gate-route";
import { getBuzzsproutCreds } from "@/lib/buzzsprout-store";
import { createEpisode } from "@/lib/buzzsprout";
import { getAI, getTranscript } from "@/lib/transcript-store";
import { activeVideoKey } from "@/lib/versions-store";
import { recordPublish } from "@/lib/publish-history-store";

interface RequestBody {
  fileId: string;
  title?: string;
  description?: string;
  summary?: string;
  tags?: string;
  artworkUrl?: string;
  publishedAt?: string;
  privateEpisode?: boolean;
  episodeNumber?: number;
  seasonNumber?: number;
}

export async function POST(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Reuse the existing "spotify" feature gate — same category (podcasts),
  // same intent. Renaming would churn DB seeds; we just treat it as
  // "podcast distribution" internally.
  const gated = await gate(user, "spotify");
  if (gated) return gated;

  const body = (await req.json().catch(() => ({}))) as RequestBody;
  if (!body.fileId)
    return NextResponse.json({ error: "missing_fileId" }, { status: 400 });

  let canonical: string;
  try {
    canonical = decodeFileId(body.fileId);
  } catch {
    return NextResponse.json({ error: "invalid_file_id" }, { status: 400 });
  }
  if (!canAccessKey(user, canonical)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const creds = await getBuzzsproutCreds(user.id);
  if (!creds) {
    return NextResponse.json(
      {
        error: "buzzsprout_not_connected",
        message:
          "Connect your Buzzsprout account first in Settings → Podcast → Buzzsprout integration.",
      },
      { status: 412 },
    );
  }

  // Resolve to whichever version is currently active so re-uploads
  // publish the new edit, not v1.
  const key = await activeVideoKey(canonical);
  const ai = await getAI(key);
  const transcript = await getTranscript(key);

  const title =
    body.title?.trim() ||
    ai?.title?.trim() ||
    `Episode — ${new Date().toISOString().slice(0, 10)}`;
  const description = body.description ?? ai?.description ?? "";
  const summary =
    body.summary ?? (ai?.summary ? ai.summary : description.slice(0, 280));
  const tags = body.tags ?? (ai?.tags?.length ? ai.tags.join(", ") : undefined);

  const audioUrl = publicUrl(key);

  try {
    const episode = await createEpisode(creds.podcastId, creds.token, {
      title,
      description,
      summary,
      tags,
      audioUrl,
      artworkUrl: body.artworkUrl,
      publishedAt: body.publishedAt,
      duration: transcript?.durationSeconds || undefined,
      privateEp: body.privateEpisode ?? false,
      episodeNumber: body.episodeNumber,
      seasonNumber: body.seasonNumber,
    });
    await recordPublish({
      userId: user.id,
      fileId: body.fileId,
      fileKey: key,
      fileName: key.split("/").pop() ?? key,
      platform: "spotify",
      action: episode.private ? "draft" : "published",
      vidType: null,
      externalId: String(episode.id),
      externalUrl: null,
      scheduledFor: null,
      metadata: { provider: "buzzsprout", podcastId: creds.podcastId },
    });
    return NextResponse.json({
      ok: true,
      episode: {
        id: episode.id,
        title: episode.title,
        private: episode.private,
        publishedAt: episode.published_at,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "buzzsprout_error", message: (err as Error).message },
      { status: 502 },
    );
  }
}
