import { NextResponse } from "next/server";

// TODO: spec §6.4 — send transcript to Claude Sonnet, save full ai_content row.
export async function POST(req: Request) {
  const { fileId } = (await req.json()) as { fileId: string };
  return NextResponse.json({
    fileId,
    title: "Why most founders never escape the grind",
    description: "Three seven-figure Canadian founders pull no punches…",
    chapters: "00:00 Intro\n02:15 The biggest hiring mistake\n10:42 PMF as a moving target",
    tags: ["founders", "startup", "entrepreneurship"],
    hashtags: ["#founders", "#startup"],
    language: "English",
    summary: "Three founders share the mistakes that almost broke them.",
  });
}
