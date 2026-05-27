import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { clearBuzzsproutCreds } from "@/lib/buzzsprout-store";

export async function POST() {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await clearBuzzsproutCreds(user.id);
  return NextResponse.json({ ok: true });
}
