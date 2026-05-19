import { NextResponse } from "next/server";

// TODO: spec §7.2 — refresh token, stream from B2 to videos.insert, save publish_history.
export async function POST(req: Request) {
  const body = (await req.json()) as Record<string, unknown>;
  return NextResponse.json({
    videoId: `yt_mock_${Date.now()}`,
    status: "published",
    scheduledFor: body.scheduledFor ?? null,
  });
}
