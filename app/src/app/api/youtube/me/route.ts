import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getConnection, publicChannels } from "@/lib/youtube-store";
import { isConfigured } from "@/lib/youtube";

export async function GET() {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!isConfigured()) {
    return NextResponse.json({
      configured: false,
      connected: false,
      channel: null,
      channels: [],
    });
  }

  const conn = await getConnection(user.id);
  if (!conn) {
    return NextResponse.json({
      configured: true,
      connected: false,
      channel: null,
      channels: [],
    });
  }

  const channels = publicChannels(conn.channels);
  const active =
    channels.find((c) => c.id === conn.activeChannelId) ?? channels[0] ?? null;

  return NextResponse.json({
    configured: true,
    connected: true,
    channel: active,
    activeChannelId: conn.activeChannelId,
    channels,
  });
}
