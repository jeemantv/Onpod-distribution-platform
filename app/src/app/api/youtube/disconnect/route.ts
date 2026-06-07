import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { clearConnection, removeChannel } from "@/lib/youtube-store";

export async function POST(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // With a channelId, remove just that channel; without one, disconnect all.
  const { channelId } = (await req.json().catch(() => ({}))) as { channelId?: string };
  if (channelId) {
    await removeChannel(user.id, channelId);
  } else {
    await clearConnection(user.id);
  }
  return NextResponse.json({ ok: true });
}
