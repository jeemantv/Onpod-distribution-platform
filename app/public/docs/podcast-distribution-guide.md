# OnPod Podcast Distribution Guide

How one RSS feed reaches every podcast app — what's automatic, what needs
a one-time submission, and what to be honest with your clients about.

---

## The one-time setup, then everything is automatic

Buzzsprout gives the client **one RSS feed URL**. They submit that URL once
to each podcast platform. From that moment on, every new episode they
upload to Buzzsprout automatically appears on all of them.

```
Client uploads episode to Buzzsprout (via OnPod)
        ↓
Buzzsprout updates the RSS feed
        ↓
   ┌────┴────────────────────────────┐
   ↓     ↓        ↓        ↓        ↓
Spotify Apple  Amazon  Pocket Castbox + 30 more
```

---

## The platforms covered

When the client submits their Buzzsprout RSS to the major directories,
here's what happens.

### Manual one-time submission required (all free)

| Platform | Submit at | Approval time |
|---|---|---|
| Apple Podcasts | podcastersapple.com | 1–7 days |
| Spotify | podcasters.spotify.com | ~24 hours |
| Amazon Music / Audible | podcasters.amazon.com | 24–48 hours |
| YouTube Music (replaced Google Podcasts) | podcasterscreatorstudio.youtube.com | Instant |
| iHeartRadio | iheart.com/podcasters | 1–2 weeks |
| TuneIn | help.tunein.com | A few days |

### Zero submission needed (auto-discovered)

Once the podcast is approved on Apple Podcasts, the following apps pull
from Apple's directory automatically:

- Pocket Casts
- Overcast
- Castbox
- Podcast Addict
- Player FM
- Podbean app
- Castro
- Stitcher
- Most other podcast apps

> **Apple is the keystone** — get on Apple, and ~25 apps come along for free.

### Buzzsprout's "Get Listed" shortcut

Buzzsprout's dashboard has built-in **"Get Listed"** buttons that pre-fill
the RSS URL into each platform's submission form. The client clicks
"Submit to Spotify" → Spotify Podcasters opens with the RSS URL already
filled in. They hit Submit and they're done. Same for Apple, Amazon,
YouTube Music, etc.

This makes the one-time setup take ~10 minutes total instead of an hour.

---

## The actual client setup flow

### Day 1 — initial setup (15 minutes total)

1. Client signs up for Buzzsprout (or you do it for them with their email).
2. Client connects Buzzsprout to OnPod (paste API token).
3. Client uploads their first episode through OnPod → Buzzsprout.
4. Client clicks Buzzsprout's "Get Listed" buttons:
   - Spotify (approved in 24 hours)
   - Apple Podcasts (approved in 1–7 days)
   - Amazon Music (24–48 hours)
   - YouTube Music (instant)

### Day 1–7 — waiting period

- Spotify approves first (usually 24 hours).
- Apple approves last (often takes a few days, but unlocks 25+ other apps).

### Day 8+ — fully automatic

- Client publishes a new episode in OnPod.
- OnPod sends it to Buzzsprout via API.
- Buzzsprout updates the RSS.
- All platforms pull from the RSS within 1–4 hours.
- Episode appears everywhere automatically.

---

## What this means for OnPod's UX

You can present this as **"Connect Buzzsprout once, publish to all podcast
apps forever."** That's a true statement.

In the OnPod settings page, expect a section that looks like:

```
┌────────────────────────────────────────────┐
│ Podcast Distribution                       │
├────────────────────────────────────────────┤
│ ✅ Buzzsprout connected                    │
│                                            │
│ Your episodes are distributed to:          │
│ ✅ Spotify                                 │
│ ✅ Apple Podcasts                          │
│ ✅ Amazon Music                            │
│ ✅ YouTube Music                           │
│ ✅ Pocket Casts (auto-discovered)          │
│ ✅ Overcast (auto-discovered)              │
│ ✅ Castbox (auto-discovered)               │
│ ✅ +22 other apps via Apple directory      │
│                                            │
│ Total reach: 30+ podcast apps              │
└────────────────────────────────────────────┘
```

OnPod queries Buzzsprout's API to know which directories the client has
submitted to, and shows the live status.

---

## Honest limitations to know about

### 1. Each platform has slightly different rules

- Spotify allows explicit language without flagging — Apple requires you
  to mark it explicit.
- Apple requires episode artwork to be 3000×3000 minimum — Spotify
  accepts 1400×1400.
- Some platforms strip emojis from titles, some don't.
- Buzzsprout handles most of this normalization automatically, but not
  all of it.

### 2. Some platforms have unique submission flows

- **iHeartRadio** is annoying — manual review can take 2 weeks.
- **Pandora** sometimes requires podcasts to have 10+ episodes before
  accepting submission.
- **Audible** (separate from Amazon Music) — only accepts curated
  podcasts, can't self-submit.
- **SoundCloud** — separate ecosystem, manual upload required, not
  RSS-based.

If a client wants those, more manual work is required.

### 3. Statistics don't combine

Buzzsprout shows total downloads. But Spotify shows Spotify-specific
listens. Apple shows Apple-specific listens. They never combine into one
true cross-platform metric — each platform jealously guards their data.

For OnPod's analytics dashboard later, this means you'll show "Total
downloads across all RSS apps (excluding Spotify and Apple platform-
native plays)" and have to grab Spotify/Apple stats separately via their
own APIs.

---

## The real picture

For 95% of podcasts, Buzzsprout's RSS distribution covers everything that
matters. A few niche cases need extra work. But for OnPod's typical
client (business podcasts, interview shows, expert content), one RSS
feed reaches every place their audience listens.

The honest pitch: **"Submit once to 4–5 directories. Approval takes a
week. After that, every episode you publish in OnPod is live on 30+
podcast apps automatically."**

That's a true, defensible promise.
