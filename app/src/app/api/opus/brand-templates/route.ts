import { NextResponse } from "next/server";
import { listBrandTemplates } from "@/lib/opusclip";
import { getSession } from "@/lib/session";

export async function GET() {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const templates = await listBrandTemplates();
    return NextResponse.json({ templates });
  } catch (err) {
    return NextResponse.json(
      { templates: [], error: (err as Error).message },
      { status: 200 },
    );
  }
}
