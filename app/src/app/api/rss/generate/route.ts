import { NextResponse } from "next/server";

// TODO: spec §8.4 — produce a valid <item> block from ai_content + file metadata.
export async function POST(req: Request) {
  const { fileId, title, description, season, episode } =
    (await req.json()) as {
      fileId: string;
      title: string;
      description: string;
      season?: string;
      episode?: string;
    };

  const xml = `<item>
  <title><![CDATA[${title}]]></title>
  <description><![CDATA[${description}]]></description>
  <itunes:summary><![CDATA[${description}]]></itunes:summary>
  <itunes:author>OnPod Studios</itunes:author>
  <itunes:image href="https://onpod.io/cover.png"/>
  <itunes:duration>00:45:00</itunes:duration>
  <itunes:explicit>false</itunes:explicit>
  ${season ? `<itunes:season>${season}</itunes:season>` : ""}
  ${episode ? `<itunes:episode>${episode}</itunes:episode>` : ""}
  <itunes:episodeType>full</itunes:episodeType>
  <pubDate>${new Date().toUTCString()}</pubDate>
  <guid isPermaLink="false">onpod-${fileId}-${Date.now()}</guid>
  <enclosure url="https://feeds.onpod.io/audio/${fileId}.mp3" length="0" type="audio/mpeg"/>
  <link>https://onpod.io</link>
</item>`;

  return new NextResponse(xml, {
    headers: { "Content-Type": "application/xml" },
  });
}
