import { NextResponse } from "next/server";

// TODO: spec §6.5 — Claude prompt for single field, optional custom direction.
export async function POST(req: Request) {
  const { fileId, field, customPrompt } = (await req.json()) as {
    fileId: string;
    field: string;
    customPrompt?: string;
  };
  void customPrompt;
  return NextResponse.json({
    fileId,
    field,
    value: `Regenerated value for ${field}`,
  });
}
