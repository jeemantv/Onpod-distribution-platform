// Save (and verify) a client's Buzzsprout API token + podcast ID.
// Verification is a live call to the Buzzsprout API — if it fails we
// don't persist, so the client can't get stuck with broken creds.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { verifyConnection } from "@/lib/buzzsprout";
import { setBuzzsproutCreds } from "@/lib/buzzsprout-store";

export async function POST(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    podcastId?: string;
    token?: string;
  };
  const podcastId = body.podcastId?.trim();
  const token = body.token?.trim();
  if (!podcastId || !token) {
    return NextResponse.json(
      { error: "missing_fields", message: "Podcast ID and API token are both required." },
      { status: 400 },
    );
  }
  // Buzzsprout podcast IDs are numeric; reject obvious typos early.
  if (!/^\d+$/.test(podcastId)) {
    return NextResponse.json(
      { error: "invalid_podcast_id", message: "Podcast ID must be numeric (find it in your Buzzsprout URL)." },
      { status: 400 },
    );
  }

  const check = await verifyConnection(podcastId, token);
  if (!check.ok) {
    return NextResponse.json(
      { error: "verify_failed", message: check.reason },
      { status: 400 },
    );
  }
  await setBuzzsproutCreds(user.id, { podcastId, token });
  return NextResponse.json({
    ok: true,
    podcastId,
    episodeCount: check.podcast.episodeCount,
  });
}
