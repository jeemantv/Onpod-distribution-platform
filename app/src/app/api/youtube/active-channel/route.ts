import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { setActiveChannel } from "@/lib/youtube-store";

// Switch which connected channel is active (the one uploads publish to).
export async function POST(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { channelId } = (await req.json().catch(() => ({}))) as { channelId?: string };
  if (!channelId) return NextResponse.json({ error: "missing_channelId" }, { status: 400 });

  const ok = await setActiveChannel(user.id, channelId);
  if (!ok) {
    return NextResponse.json(
      { error: "not_found", message: "That channel isn't connected." },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true, activeChannelId: channelId });
}
