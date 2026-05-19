// Builds a full podcast RSS feed (spec §8) from a ShowConfig and its episodes.

import type { Episode, ShowConfig } from "./podcast-store";

function cdata(s: string): string {
  return `<![CDATA[${s.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

function escapeAttr(s: string): string {
  return s.replace(/[<>&"']/g, (c) => {
    switch (c) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case '"': return "&quot;";
      case "'": return "&#39;";
    }
    return c;
  });
}

function rfc2822(ms: number): string {
  return new Date(ms).toUTCString();
}

function isoDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

export function buildEpisodeItem(ep: Episode): string {
  return `  <item>
    <title>${cdata(ep.title)}</title>
    <description>${cdata(ep.description)}</description>
    <itunes:summary>${cdata(ep.description)}</itunes:summary>
    <itunes:duration>${isoDuration(ep.durationSeconds)}</itunes:duration>
    <itunes:explicit>false</itunes:explicit>
    ${ep.season !== undefined ? `<itunes:season>${ep.season}</itunes:season>` : ""}
    ${ep.episode !== undefined ? `<itunes:episode>${ep.episode}</itunes:episode>` : ""}
    <itunes:episodeType>full</itunes:episodeType>
    <pubDate>${rfc2822(ep.publishedAt)}</pubDate>
    <guid isPermaLink="false">${escapeAttr(ep.guid)}</guid>
    <enclosure url="${escapeAttr(ep.audioUrl)}" length="${ep.audioBytes}" type="${escapeAttr(ep.audioMime)}"/>
  </item>`;
}

export function buildFullFeed(
  show: ShowConfig,
  episodes: Episode[],
  feedSelfUrl: string,
): string {
  const items = episodes.map(buildEpisodeItem).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${cdata(show.title)}</title>
  <link>${escapeAttr(show.link)}</link>
  <atom:link href="${escapeAttr(feedSelfUrl)}" rel="self" type="application/rss+xml"/>
  <language>${escapeAttr(show.language)}</language>
  <description>${cdata(show.description)}</description>
  <itunes:summary>${cdata(show.description)}</itunes:summary>
  <itunes:author>${cdata(show.author)}</itunes:author>
  <itunes:owner>
    <itunes:name>${cdata(show.author)}</itunes:name>
    <itunes:email>${escapeAttr(show.authorEmail)}</itunes:email>
  </itunes:owner>
  <itunes:image href="${escapeAttr(show.coverUrl)}"/>
  <itunes:category text="${escapeAttr(show.categoryItunes)}"/>
  <itunes:explicit>${show.explicit ? "true" : "false"}</itunes:explicit>
  <itunes:type>episodic</itunes:type>
${items}
</channel>
</rss>`;
}
