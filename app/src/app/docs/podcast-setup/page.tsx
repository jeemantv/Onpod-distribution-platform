"use client";

import Link from "next/link";

export default function PodcastSetupPage() {
  return (
    <main className="max-w-[760px] mx-auto px-4 sm:px-8 py-10 text-[14px] leading-relaxed print-doc">
      <div className="print-hide">
        <Link href="/account" className="text-[12px] text-text-muted hover:text-text">
          ← Back to account
        </Link>
      </div>
      <h1 className="display text-[32px] mt-3 mb-2">Podcast setup guide</h1>
      <p className="text-text-muted text-[13px] mb-4">
        How to get your podcast live on Spotify, Apple Podcasts, and the rest
        of the world. Two paths — Buzzsprout (recommended, paid) or Spotify
        manual (free, slower).
      </p>
      <DownloadBar />
      <PlatformReachCallout />

      <SectionTitle>The short version</SectionTitle>
      <p className="mb-4">
        OnPod records and edits your podcast. To distribute it (Spotify,
        Apple, Amazon Music, Pocket Casts, etc.), you need a podcast host —
        the thing that serves your audio file and the RSS feed every
        directory polls. Two ways to do this:
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <Card>
          <CardTag tone="green">Recommended</CardTag>
          <h3 className="text-[16px] font-medium mb-1">Buzzsprout (auto)</h3>
          <p className="text-text-muted text-[12px] mb-2">
            One-click publish from OnPod. Fans out to every directory
            automatically. Built-in analytics.
          </p>
          <p className="text-[13px] mt-3">$12–24 CAD/mo</p>
        </Card>
        <Card>
          <CardTag tone="neutral">Free path</CardTag>
          <h3 className="text-[16px] font-medium mb-1">Spotify manual (RSS)</h3>
          <p className="text-text-muted text-[12px] mb-2">
            OnPod generates an RSS feed. You paste it into Spotify for
            Podcasters + Apple Podcasts Connect once. No host fee.
          </p>
          <p className="text-[13px] mt-3">Free</p>
        </Card>
      </div>

      <SectionTitle>Recommended setup — Buzzsprout</SectionTitle>

      <h3 className="text-[15px] font-medium mt-6 mb-2">1. Make a Buzzsprout account</h3>
      <ol className="list-decimal pl-6 space-y-1.5 mb-4 text-text-muted">
        <li>
          Sign up at{" "}
          <a className="underline text-accent-2" href="https://www.buzzsprout.com/signup" target="_blank" rel="noreferrer">
            buzzsprout.com/signup
          </a>{" "}
          (use the same email as your OnPod login if you can).
        </li>
        <li>Create your show — title, description, category, cover art.</li>
        <li>Pick a plan (see pricing below).</li>
      </ol>

      <h3 className="text-[15px] font-medium mt-6 mb-2">2. Grab your podcast ID + API token</h3>
      <ol className="list-decimal pl-6 space-y-1.5 mb-4 text-text-muted">
        <li>
          <strong className="text-text">Podcast ID</strong> — open your Buzzsprout
          dashboard. The URL looks like{" "}
          <code className="text-accent-2">buzzsprout.com/2364712/episodes</code>.
          The number is your podcast ID.
        </li>
        <li>
          <strong className="text-text">API token</strong> — Settings → Buzzsprout
          API → copy the long string.
        </li>
      </ol>

      <h3 className="text-[15px] font-medium mt-6 mb-2">3. Connect inside OnPod</h3>
      <ol className="list-decimal pl-6 space-y-1.5 mb-4 text-text-muted">
        <li>
          Go to{" "}
          <Link href="/settings/podcast" className="underline text-accent-2">
            Settings → Podcast
          </Link>
          .
        </li>
        <li>Paste podcast ID + API token, click <em>Connect</em>.</li>
        <li>
          We verify against the Buzzsprout API immediately — if the credentials
          are wrong, you&apos;ll see why and nothing gets saved.
        </li>
      </ol>

      <h3 className="text-[15px] font-medium mt-6 mb-2">4. Link Buzzsprout to Spotify, Apple, etc.</h3>
      <p className="mb-3 text-text-muted">
        Inside the Buzzsprout dashboard, hit <em>Directories</em>. They walk
        you through pasting your Buzzsprout feed URL into each platform once.
        After this, every episode you publish from OnPod auto-distributes.
      </p>
      <ul className="list-disc pl-6 space-y-1 mb-4 text-text-muted text-[13px]">
        <li>Spotify — instant, no review</li>
        <li>Apple Podcasts — 24–48h review on first show</li>
        <li>Amazon Music, Pocket Casts, Overcast, Castbox — auto from RSS</li>
      </ul>

      <h3 className="text-[15px] font-medium mt-6 mb-2">5. Publish your first episode</h3>
      <p className="text-text-muted mb-2">
        Inside any project, hit the green Buzzsprout button on the row of the
        edited video. We pre-fill title, description, summary, and tags from
        the AI metadata. Pick <em>Save as draft</em> on the first one to
        sanity-check the show notes before going live.
      </p>

      <SectionTitle>Buzzsprout pricing (2026)</SectionTitle>
      <div className="overflow-x-auto -mx-2 mb-8">
        <table className="w-full text-[13px] border border-border rounded-[10px] overflow-hidden">
          <thead>
            <tr className="bg-bg-elev-2 text-text-muted text-[11px] uppercase tracking-wider">
              <th className="text-left p-3">Plan</th>
              <th className="text-left p-3">Price (CAD/mo)</th>
              <th className="text-left p-3">Upload/mo</th>
              <th className="text-left p-3">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            <Row plan="Free" price="$0" upload="2h" notes="Episodes expire after 90 days — useless for a permanent show. Trial only." />
            <Row plan="$12" price="$12" upload="3h" notes="Good for weekly 45-min episodes." />
            <Row plan="$18 (recommended)" price="$18" upload="6h" notes="Unlimited storage on episodes. Magic Mastering audio cleanup included." />
            <Row plan="$24" price="$24" upload="12h" notes="Multi-host shows, more upload budget." />
          </tbody>
        </table>
      </div>
      <p className="text-text-muted text-[12px] mb-8">
        Prices in CAD, billed monthly. Buzzsprout also offers a 90-day money-
        back guarantee. Annual billing knocks ~15% off — see their pricing
        page for current numbers.
      </p>

      <SectionTitle>Free path — Spotify manual (RSS)</SectionTitle>
      <p className="text-text-muted mb-3">
        If you don&apos;t want to pay for a host, OnPod can serve your podcast
        RSS feed directly. You submit the feed URL once to each directory
        manually. New episodes appear automatically going forward.
      </p>
      <ol className="list-decimal pl-6 space-y-1.5 mb-4 text-text-muted">
        <li>
          Inside a project, click the Buzzsprout button on the edited video.
          Switch the tab to <em>Spotify · manual (free)</em>.
        </li>
        <li>Edit the show metadata, push the episode.</li>
        <li>
          Copy your feed URL (we show it after the push). Paste it into:
          <ul className="list-disc pl-6 mt-1.5 text-[12px]">
            <li>
              <a className="underline text-accent-2" href="https://podcasters.spotify.com" target="_blank" rel="noreferrer">
                Spotify for Podcasters
              </a>{" "}
              → Add show → &quot;I already have a podcast.&quot;
            </li>
            <li>
              <a className="underline text-accent-2" href="https://podcastsconnect.apple.com" target="_blank" rel="noreferrer">
                Apple Podcasts Connect
              </a>{" "}
              → New Show → Add a show with an RSS feed.
            </li>
            <li>Amazon Music for Podcasters, Pocket Casts, Overcast — all accept the same feed.</li>
          </ul>
        </li>
        <li>
          From now on, every push from OnPod updates the feed and every
          directory picks it up within minutes (Spotify) to hours (Apple).
        </li>
      </ol>
      <p className="text-text-muted text-[12px] mt-4">
        Tradeoffs vs. Buzzsprout: no built-in analytics, no audio mastering,
        the one-time submission to each directory is fiddly. But it&apos;s
        free.
      </p>

      <SectionTitle>FAQ</SectionTitle>

      <Q q="Do I need both Buzzsprout AND the RSS option?">
        No. Pick one. Buzzsprout is the one we recommend; the RSS option is
        there as a free fallback. Once you switch to Buzzsprout, ignore the
        OnPod RSS feed entirely — Buzzsprout becomes your feed.
      </Q>
      <Q q="Will my old episodes move over if I switch from RSS to Buzzsprout?">
        Not automatically — you&apos;d re-upload them inside Buzzsprout (or
        via OnPod once connected). For a fresh show, just start on Buzzsprout
        from day one.
      </Q>
      <Q q="Does OnPod handle the audio extraction?">
        Buzzsprout accepts the MP4 directly — they strip the audio
        server-side. You don&apos;t need to export an MP3 first.
      </Q>
      <Q q="Can I keep episodes private until I'm ready?">
        Yes. In the publish modal, leave <em>Save as private draft</em>{" "}
        checked. The episode lands in Buzzsprout as a draft and you publish
        manually from their dashboard.
      </Q>
      <Q q="What if my Buzzsprout token gets rotated?">
        OnPod calls the Buzzsprout API on every publish. If the token stops
        working, we surface the error and you can reconnect in{" "}
        <Link href="/settings/podcast" className="underline text-accent-2">
          Settings → Podcast
        </Link>
        .
      </Q>

      <SectionTitle>Where your podcast lands — full picture</SectionTitle>

      <p className="mb-4">
        Buzzsprout gives you <strong>one RSS feed URL</strong>. You submit
        that URL once to each podcast platform, and from that moment on,
        every new episode you publish in OnPod appears on all of them
        automatically.
      </p>

      <pre className="text-[11px] leading-tight bg-bg-elev-2 border border-border rounded-[10px] p-4 mb-6 overflow-x-auto font-mono">{`Client uploads episode to Buzzsprout (via OnPod)
        ↓
Buzzsprout updates the RSS feed
        ↓
   ┌────┴────────────────────────────┐
   ↓     ↓        ↓        ↓        ↓
Spotify Apple  Amazon  Pocket Castbox + 30 more`}</pre>

      <h3 className="text-[15px] font-medium mt-6 mb-2">Manual one-time submission (all free)</h3>
      <div className="overflow-x-auto -mx-2 mb-6">
        <table className="w-full text-[13px] border border-border rounded-[10px] overflow-hidden">
          <thead>
            <tr className="bg-bg-elev-2 text-text-muted text-[11px] uppercase tracking-wider">
              <th className="text-left p-3">Platform</th>
              <th className="text-left p-3">Submit at</th>
              <th className="text-left p-3">Approval</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            <PRow name="Apple Podcasts" submit="podcastersapple.com" wait="1–7 days" />
            <PRow name="Spotify" submit="podcasters.spotify.com" wait="~24 hours" />
            <PRow name="Amazon Music / Audible" submit="podcasters.amazon.com" wait="24–48 hours" />
            <PRow name="YouTube Music" submit="podcasterscreatorstudio.youtube.com" wait="instant" />
            <PRow name="iHeartRadio" submit="iheart.com/podcasters" wait="1–2 weeks" />
            <PRow name="TuneIn" submit="help.tunein.com" wait="a few days" />
          </tbody>
        </table>
      </div>

      <h3 className="text-[15px] font-medium mt-6 mb-2">Zero submission needed (auto-discovered)</h3>
      <p className="text-text-muted mb-2 text-[13px]">
        Once your podcast is approved on Apple Podcasts, these apps pull
        from Apple&apos;s directory automatically:
      </p>
      <ul className="list-disc pl-6 space-y-0.5 mb-3 text-text-muted text-[13px]">
        <li>Pocket Casts</li>
        <li>Overcast</li>
        <li>Castbox</li>
        <li>Podcast Addict</li>
        <li>Player FM</li>
        <li>Podbean app</li>
        <li>Castro</li>
        <li>Stitcher</li>
        <li>Most other podcast apps</li>
      </ul>
      <p className="text-[13px] mb-6">
        <strong>Apple is the keystone</strong> — get on Apple, and ~25 apps
        come along for free.
      </p>

      <h3 className="text-[15px] font-medium mt-6 mb-2">Buzzsprout&apos;s &quot;Get Listed&quot; shortcut</h3>
      <p className="text-text-muted mb-2 text-[13px]">
        Buzzsprout&apos;s dashboard has built-in <em>Get Listed</em> buttons
        that pre-fill your RSS URL into each platform&apos;s submission form.
        Click <em>Submit to Spotify</em> → Spotify Podcasters opens with the
        RSS URL already filled in. Hit Submit and you&apos;re done. Same for
        Apple, Amazon, YouTube Music, etc. The whole one-time setup takes
        ~10 minutes total instead of an hour.
      </p>

      <SectionTitle>Realistic 7-day onboarding</SectionTitle>

      <Phase title="Day 1 — initial setup (15 minutes)">
        <ol className="list-decimal pl-5 space-y-1 text-text-muted">
          <li>Sign up for Buzzsprout (or have us do it with your email).</li>
          <li>Connect Buzzsprout to OnPod (paste API token in <Link className="underline text-accent-2" href="/settings/podcast">Settings → Podcast</Link>).</li>
          <li>Upload your first episode through OnPod → Buzzsprout.</li>
          <li>Click Buzzsprout&apos;s &quot;Get Listed&quot; buttons: Spotify, Apple, Amazon, YouTube Music.</li>
        </ol>
      </Phase>

      <Phase title="Day 1–7 — waiting period">
        <ul className="list-disc pl-5 space-y-1 text-text-muted">
          <li>Spotify approves first (~24 hours).</li>
          <li>Apple approves last (1–7 days), but unlocks 25+ other apps.</li>
        </ul>
      </Phase>

      <Phase title="Day 8+ — fully automatic">
        <p className="text-text-muted">
          Every new episode you publish in OnPod goes to Buzzsprout via API
          → updates the RSS feed → all platforms pull within 1–4 hours.
          Nothing manual ever again.
        </p>
      </Phase>

      <SectionTitle>Honest limitations</SectionTitle>

      <h3 className="text-[15px] font-medium mt-4 mb-2">1. Platforms have slightly different rules</h3>
      <ul className="list-disc pl-6 space-y-1 mb-4 text-text-muted text-[13px]">
        <li>Spotify allows explicit language without flagging — Apple requires you to mark it explicit.</li>
        <li>Apple requires episode artwork ≥3000×3000 — Spotify accepts 1400×1400.</li>
        <li>Some platforms strip emojis from titles, some don&apos;t.</li>
        <li>Buzzsprout handles most normalization automatically, but not all.</li>
      </ul>

      <h3 className="text-[15px] font-medium mt-4 mb-2">2. A few platforms are awkward</h3>
      <ul className="list-disc pl-6 space-y-1 mb-4 text-text-muted text-[13px]">
        <li><strong>iHeartRadio</strong> — manual review can take 2 weeks.</li>
        <li><strong>Pandora</strong> — sometimes requires 10+ episodes before accepting.</li>
        <li><strong>Audible</strong> (separate from Amazon Music) — curated only, can&apos;t self-submit.</li>
        <li><strong>SoundCloud</strong> — separate ecosystem, manual upload, not RSS-based.</li>
      </ul>

      <h3 className="text-[15px] font-medium mt-4 mb-2">3. Statistics don&apos;t combine</h3>
      <p className="text-text-muted text-[13px] mb-4">
        Buzzsprout shows total downloads. Spotify shows Spotify-specific
        listens. Apple shows Apple-specific listens. They never combine
        into one true cross-platform metric — each platform jealously
        guards their data. For OnPod analytics, this means &quot;total
        downloads across RSS apps (excluding Spotify- and Apple-native
        plays).&quot;
      </p>

      <SectionTitle>The honest pitch</SectionTitle>
      <p className="mb-2">
        For 95% of podcasts, Buzzsprout&apos;s RSS distribution covers
        everything that matters. A few niche cases need extra work. But
        for the typical OnPod client — business shows, interviews, expert
        content — one RSS feed reaches every place your audience listens.
      </p>
      <p className="mb-4 italic">
        &quot;Submit once to 4–5 directories. Approval takes a week. After
        that, every episode you publish in OnPod is live on 30+ podcast
        apps automatically.&quot;
      </p>

      <style jsx global>{`
        @media print {
          body {
            background: white !important;
            color: black !important;
          }
          .print-hide {
            display: none !important;
          }
          .print-doc {
            max-width: 100% !important;
            padding: 0 !important;
            color: black !important;
          }
          .print-doc * {
            color: black !important;
            background: white !important;
            border-color: #ccc !important;
          }
          .print-doc a {
            color: black !important;
            text-decoration: underline !important;
          }
          .print-doc h1,
          .print-doc h2,
          .print-doc h3 {
            page-break-after: avoid;
          }
          .print-doc pre {
            page-break-inside: avoid;
          }
        }
      `}</style>
    </main>
  );
}

function DownloadBar() {
  const printPage = () => {
    if (typeof window !== "undefined") window.print();
  };
  return (
    <div className="print-hide mb-8 flex flex-wrap items-center gap-2 p-3 bg-bg-elev border border-border rounded-[10px]">
      <span className="text-[12px] text-text-muted mr-2">Save this guide:</span>
      <a
        href="/docs/podcast-distribution-guide.md"
        download="onpod-podcast-distribution-guide.md"
        className="px-3 py-1.5 rounded-[8px] bg-bg-elev-2 border border-border-strong text-[12px] hover:bg-bg-elev-3"
      >
        Download as Markdown
      </a>
      <button
        type="button"
        onClick={printPage}
        className="px-3 py-1.5 rounded-[8px] bg-bg-elev-2 border border-border-strong text-[12px] hover:bg-bg-elev-3"
      >
        Save as PDF
      </button>
      <span className="ml-auto text-[11px] text-text-muted hidden sm:inline">
        PDF uses your browser&apos;s print dialog → &quot;Save as PDF&quot;
      </span>
    </div>
  );
}

function PlatformReachCallout() {
  return (
    <div className="print-hide mb-10 p-5 rounded-[12px] bg-[rgba(16,185,129,0.06)] border border-[rgba(16,185,129,0.25)]">
      <h3 className="text-[15px] font-medium mb-2">
        Connect Buzzsprout once → publish to 30+ podcast apps forever
      </h3>
      <p className="text-[12px] text-text-muted mb-3 leading-relaxed">
        Spotify, Apple Podcasts, Amazon Music, and YouTube Music need a one-
        time submission (10 min total via Buzzsprout&apos;s &quot;Get Listed&quot;
        shortcut). Approval takes 1–7 days. After that, every episode you
        publish in OnPod auto-distributes everywhere.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-[12px]">
        <span>✅ Spotify</span>
        <span>✅ Apple Podcasts</span>
        <span>✅ Amazon Music</span>
        <span>✅ YouTube Music</span>
        <span>✅ Pocket Casts</span>
        <span>✅ Overcast</span>
        <span>✅ Castbox</span>
        <span>✅ Podcast Addict</span>
        <span>✅ +22 more via Apple</span>
      </div>
    </div>
  );
}

function Phase({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 p-4 bg-bg-elev-2 border border-border rounded-[10px]">
      <h4 className="text-[13px] font-medium mb-2">{title}</h4>
      <div className="text-[13px]">{children}</div>
    </div>
  );
}

function PRow({ name, submit, wait }: { name: string; submit: string; wait: string }) {
  return (
    <tr>
      <td className="p-3 font-medium">{name}</td>
      <td className="p-3 text-text-muted font-mono text-[12px]">{submit}</td>
      <td className="p-3 text-text-muted">{wait}</td>
    </tr>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="display text-[22px] mt-10 mb-3 border-b border-border pb-2">
      {children}
    </h2>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-4 bg-bg-elev border border-border rounded-[12px]">
      {children}
    </div>
  );
}

function CardTag({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "green" | "neutral";
}) {
  const cls =
    tone === "green"
      ? "bg-[rgba(16,185,129,0.12)] text-[#34d399] border-[rgba(16,185,129,0.25)]"
      : "bg-bg-elev-2 text-text-muted border-border";
  return (
    <span className={`inline-block text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border mb-2 ${cls}`}>
      {children}
    </span>
  );
}

function Row({
  plan,
  price,
  upload,
  notes,
}: {
  plan: string;
  price: string;
  upload: string;
  notes: string;
}) {
  return (
    <tr>
      <td className="p-3 font-medium">{plan}</td>
      <td className="p-3">{price}</td>
      <td className="p-3 text-text-muted">{upload}</td>
      <td className="p-3 text-text-muted text-[12px]">{notes}</td>
    </tr>
  );
}

function Q({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="font-medium mb-1">{q}</p>
      <p className="text-text-muted text-[13px] leading-relaxed">{children}</p>
    </div>
  );
}
