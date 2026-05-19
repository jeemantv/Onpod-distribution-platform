import { NextResponse } from "next/server";
import { getEpisodes, getShowBySlug } from "@/lib/podcast-store";
import { buildFullFeed } from "@/lib/rss";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { slug: string } },
) {
  const slug = params.slug.replace(/\.xml$/, "");
  const show = await getShowBySlug(slug);
  if (!show) {
    return new NextResponse("show not found", { status: 404 });
  }
  const episodes = await getEpisodes(slug);
  const feedSelfUrl = new URL(`/feeds/${slug}.xml`, req.url).toString();
  const xml = buildFullFeed(show, episodes, feedSelfUrl);
  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
