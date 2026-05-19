import { NextResponse } from "next/server";
import { getProjectsForUser } from "@/lib/mock-data";
import { getSession } from "@/lib/session";

// TODO: spec §5.1 — query the `projects` table for current user.
export async function GET() {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ projects: getProjectsForUser(user.id) });
}
