import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { listClientSessions, listSessionFiles } from "@/lib/studio-store";

export const maxDuration = 30;

export async function GET(req: Request) {
  const user = requireSession();
  const url = new URL(req.url);
  const folder = url.searchParams.get("folder");
  const studio = url.searchParams.get("studio");

  if (folder && studio) {
    const files = await listSessionFiles(studio as never, "clients", folder);
    return NextResponse.json({ files });
  }
  const sessions = await listClientSessions(user.email);
  return NextResponse.json({ sessions });
}
