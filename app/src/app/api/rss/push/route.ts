// Add a session audio/video file as a podcast episode on the show
// belonging to the client whose email is embedded in the session folder.
// Admin/editor can publish on behalf of a client; clients can publish
// their own sessions.

import { NextResponse } from "next/server";
import { decodeFileId, publicUrl, listFiles } from "@/lib/b2";
import { getSession } from "@/lib/session";
import { canAccessKey } from "@/lib/access";
import {
  addEpisode,
  getShowByUser,
  upsertShow,
  type Episode,
  type ShowConfig,
} from "@/lib/podcast-store";
import { getAI, getTranscript } from "@/lib/transcript-store";
import { getUserByEmail as getStoredUserByEmail } from "@/lib/auth-store";
import { getUserByEmail as getMockUserByEmail } from "@/lib/mock-data";
import { parseKey } from "@/lib/studio";

interface RequestBody {
  fileId: string;
  title?: string;
  description?: string;
  season?: number;
  episode?: number;
}

interface ShowOwner {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

async function resolveShowOwner(
  key: string,
  fallbackUser: { id: string; email: string; firstName: string; lastName: string },
): Promise<ShowOwner> {
  const parsed = parseKey(key);
  if (parsed.bucket === "clients" && parsed.parsedSession) {
    const email = parsed.parsedSession.email;
    const stored = await getStoredUserByEmail(email);
    if (stored) {
      return {
        id: stored.id,
        email: stored.email,
        firstName: stored.firstName,
        lastName: stored.lastName,
      };
    }
    const mock = getMockUserByEmail(email);
    if (mock) {
      return {
        id: mock.id,
        email: mock.email,
        firstName: mock.firstName,
        lastName: mock.lastName,
      };
    }
    // No account yet — use email as the canonical id so the show
    // remains discoverable when the client signs up later.
    const id = `email-${email.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
    const [first, ...rest] = email.split("@")[0].split(".");
    return {
      id,
      email,
      firstName: first || "Podcast",
      lastName: rest.join(" ") || "Host",
    };
  }
  return fallbackUser;
}

async function lookupFileSize(key: string): Promise<number> {
  try {
    const items = await listFiles(key);
    return items[0]?.sizeBytes ?? 0;
  } catch {
    return 0;
  }
}

function audioMimeFor(key: string): string {
  if (key.endsWith(".mp3")) return "audio/mpeg";
  if (key.endsWith(".wav")) return "audio/wav";
  if (key.endsWith(".m4a") || key.endsWith(".aac")) return "audio/mp4";
  if (key.endsWith(".flac")) return "audio/flac";
  if (key.endsWith(".ogg") || key.endsWith(".oga")) return "audio/ogg";
  return "video/mp4";
}

export async function POST(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as RequestBody;
  if (!body.fileId)
    return NextResponse.json({ error: "missing_fileId" }, { status: 400 });

  let key: string;
  try {
    key = decodeFileId(body.fileId);
  } catch {
    return NextResponse.json({ error: "invalid_file_id" }, { status: 400 });
  }
  if (!canAccessKey(user, key)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const owner = await resolveShowOwner(key, user);

  let show = await getShowByUser(owner.id);
  if (!show) {
    const slug = owner.id.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
    const seed: ShowConfig = {
      userId: owner.id,
      slug,
      title: `${owner.firstName} ${owner.lastName} Podcast`,
      description: "A podcast distributed via OnPod Studios.",
      author: `${owner.firstName} ${owner.lastName}`,
      authorEmail: owner.email,
      language: "en",
      categoryItunes: "Business",
      coverUrl: "",
      link: "https://onpod.io",
      explicit: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    show = await upsertShow(seed);
  }

  const ai = await getAI(key);
  const transcript = await getTranscript(key);
  const title = body.title ?? ai?.title ?? "Untitled episode";
  const description = body.description ?? ai?.description ?? "";

  // Bucket is allPublic — Apple/Spotify will poll this for years, so use
  // the permanent public URL rather than a signed one.
  const audioUrl = publicUrl(key);
  const audioBytes = await lookupFileSize(key);

  const ep: Episode = {
    guid: `onpod-${key}`,
    fileId: body.fileId,
    title,
    description,
    audioUrl,
    audioMime: audioMimeFor(key),
    audioBytes,
    durationSeconds: transcript?.durationSeconds ?? 0,
    season: body.season,
    episode: body.episode,
    publishedAt: Date.now(),
  };

  const episodes = await addEpisode(show.slug, ep);
  const feedUrl = new URL(`/feeds/${show.slug}.xml`, req.url).toString();
  return NextResponse.json({
    show,
    feedUrl,
    owner,
    episodeCount: episodes.length,
    addedEpisode: ep,
  });
}
