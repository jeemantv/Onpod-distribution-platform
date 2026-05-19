import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { clearConnection } from "@/lib/youtube-store";

export async function POST() {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await clearConnection(user.id);
  return NextResponse.json({ ok: true });
}
