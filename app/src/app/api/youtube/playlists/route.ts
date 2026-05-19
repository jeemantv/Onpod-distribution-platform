import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getFreshAccessToken } from "@/lib/youtube-store";

interface YouTubePlaylist {
  id: string;
  title: string;
  itemCount: number;
}

export async function GET() {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const accessToken = await getFreshAccessToken(user.id);
  if (!accessToken) {
    return NextResponse.json({ playlists: [] });
  }

  try {
    const params = new URLSearchParams({
      part: "snippet,contentDetails",
      mine: "true",
      maxResults: "50",
    });
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/playlists?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      return NextResponse.json(
        { playlists: [], error: `youtube_${res.status}` },
        { status: 200 },
      );
    }
    const data = (await res.json()) as {
      items?: Array<{
        id: string;
        snippet: { title: string };
        contentDetails: { itemCount: number };
      }>;
    };
    const playlists: YouTubePlaylist[] = (data.items ?? []).map((p) => ({
      id: p.id,
      title: p.snippet.title,
      itemCount: p.contentDetails?.itemCount ?? 0,
    }));
    return NextResponse.json({ playlists });
  } catch (err) {
    return NextResponse.json(
      { playlists: [], error: (err as Error).message },
      { status: 200 },
    );
  }
}
