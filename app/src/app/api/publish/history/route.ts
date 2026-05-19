import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { historyForUser } from "@/lib/publish-history-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rows = await historyForUser(user.id);
  return NextResponse.json({ history: rows });
}
