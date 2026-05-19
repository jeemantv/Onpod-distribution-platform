import { NextResponse } from "next/server";

// TODO: spec §6.6 — generate format-specific article, deduct `articles` credit.
export async function POST(req: Request) {
  const { fileId, format } = (await req.json()) as {
    fileId: string;
    format: string;
  };
  return NextResponse.json({
    fileId,
    format,
    markdown: `# Mock ${format} article\n\nGenerated from transcript. Replace with Claude call.`,
  });
}
