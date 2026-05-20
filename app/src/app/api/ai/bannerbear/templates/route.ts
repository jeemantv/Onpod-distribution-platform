import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { listTemplates } from "@/lib/bannerbear";

export const maxDuration = 30;

export async function GET() {
  requireSession();
  try {
    const templates = await listTemplates();
    return NextResponse.json({ templates });
  } catch (err) {
    return NextResponse.json(
      { error: "bannerbear_error", message: (err as Error).message },
      { status: 500 },
    );
  }
}
