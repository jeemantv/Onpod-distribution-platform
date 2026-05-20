import { NextResponse } from "next/server";
import { requireEditorOrAdmin } from "@/lib/session";
import { summarizeStudios } from "@/lib/studio-store";

export const maxDuration = 30;

export async function GET() {
  requireEditorOrAdmin();
  const studios = await summarizeStudios();
  return NextResponse.json({ studios });
}
