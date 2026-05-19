# OnPod Distribution Platform — Technical Specification

**Version:** 1.0
**Last updated:** May 2026
**Status:** Ready for development
**Owner:** Jeremy Prudhomme (jeremy@onpod.io)

---

## 1. Purpose & business context

### 1.1 What OnPod is

OnPod Studios operates four podcast studio locations inside coworking spaces across Canada (Ottawa, Montréal, Brossard, Laval). Clients book a session, OnPod records on multiple cameras + audio, and delivers the files via shared folders. This platform replaces the current static file-sharing experience with a full post-production and publishing workflow built around those folders.

### 1.2 What we're building

A web application where podcast clients log into their account, see all their past and upcoming studio sessions as folders, open any folder to access raw + edited files, generate AI-powered metadata (titles, descriptions, chapters, articles), publish episodes to YouTube and Spotify, generate short-form clips with OpusClip, and get approval workflows for client review.

Studio admins (Jeremy and future team) can see all clients, manage their plans and credits, view all projects across studios, and impersonate any client for support.

### 1.3 Business model

Three monthly subscription tiers (Stripe-billed):

| Plan | Price (CAD) | Podcasts/mo | Articles/mo | OpusClip jobs/mo | Cover arts/mo |
|------|-------------|-------------|-------------|------------------|---------------|
| Starter | $299 | 2 | 10 | 6 | 2 |
| Pro | $699 | 4 | 30 | 20 | 8 |
| Authority | $1,499 | 8 | unlimited | unlimited | unlimited |

Plus à-la-carte credit add-ons admins can grant. Admin account is unlimited.

### 1.4 What success looks like

A non-technical podcast client can: receive a magic link, click it, see their sessions, click into one, generate a fully-formed YouTube title/description/chapters via AI, publish to YouTube (real OAuth upload), generate the Spotify RSS XML for their feed, kick off OpusClip generation, and approve files for delivery — all without leaving the app. End-to-end in under 5 minutes per episode.

---

## 2. Tech stack & architecture

### 2.1 Recommended stack

- **Frontend & backend:** Next.js 14 (App Router)
- **Hosting:** Firebase Hosting + Firebase Functions (client is already on Firebase) OR Vercel if migration is acceptable
- **Database:** Firestore (if staying on Firebase) OR Postgres via Neon (preferred for relational data)
- **Auth:** Auth.js with magic link via Resend (passwordless email)
- **File storage:** Backblaze B2 (already in use; S3-compatible API)
- **Payments:** Stripe (Checkout + Customer Portal + webhooks)
- **Transcription:** Deepgram Nova-2 API
- **AI content:** Anthropic Claude API (Claude Sonnet 4)
- **Image generation (optional):** Gemini Image / Flux / Ideogram
- **Short clips:** OpusClip API (partner/enterprise tier)
- **Email:** Resend (magic links + approval requests)

### 2.2 Why these choices

- **Firebase Functions for proxies:** Deepgram, Claude, OpusClip, and YouTube OAuth all require server-side API keys. Functions keep keys safe and handle CORS.
- **Backblaze:** Already integrated; ~80% cheaper than S3 for podcast video storage.
- **Magic links:** Podcast clients are non-technical; password resets create support burden. Magic links are simpler and more secure for this audience.
- **Stripe Checkout (not custom checkout):** Battle-tested, handles tax, SCA, dunning, and the customer portal handles cancellations automatically.

### 2.3 High-level architecture

```
Client browser
    │
    ├── Static assets (Firebase Hosting / Vercel CDN)
    │
    └── Next.js app
            │
            ├── /api/auth/* (Auth.js + Resend magic links)
            ├── /api/transcribe (proxy → Deepgram)
            ├── /api/ai/generate (proxy → Claude)
            ├── /api/youtube/* (OAuth + Data API upload)
            ├── /api/opus/* (proxy → OpusClip API)
            ├── /api/rss/generate (RSS XML generation)
            ├── /api/stripe/* (Checkout + webhooks)
            └── /api/files/* (Backblaze B2 signed URLs)
                    │
                    └── Database (Firestore or Postgres)
                          ├── users, projects, files
                          ├── credits, credit_transactions
                          ├── ai_content, transcripts
                          ├── publish_history, approvals
                          └── stripe_customers, subscriptions
```

---

## 3. Data model

### 3.1 Tables / collections

**users**
- `id` (uuid, pk)
- `email` (string, unique)
- `firstName` (string)
- `lastName` (string)
- `avatar` (string, 2-char initials)
- `avatarColor` (string, CSS gradient)
- `role` (enum: `client`, `admin`)
- `plan` (enum: `starter`, `pro`, `authority`, `unlimited`)
- `stripeCustomerId` (string, nullable)
- `stripeSubscriptionId` (string, nullable)
- `creditsResetAt` (timestamp — monthly reset)
- `createdAt` (timestamp)

**credits** (one row per user; updated atomically)
- `userId` (uuid, fk)
- `podcastsUsed` (int)
- `articlesUsed` (int)
- `opusClipsUsed` (int)
- `coverArtsUsed` (int)
- `bonusPodcasts` (int, default 0)
- `bonusArticles` (int, default 0)
- `bonusOpusClips` (int, default 0)
- `bonusCoverArts` (int, default 0)

**credit_transactions** (audit log)
- `id`
- `userId`
- `type` (enum: `consume`, `grant`, `reset`)
- `category` (enum: `podcasts`, `articles`, `opusClips`, `coverArts`)
- `amount` (int — negative for consume, positive for grant)
- `reason` (string — e.g. "Generated AI metadata for project p_abc123")
- `createdAt`

**projects**
- `id` (uuid, pk)
- `userId` (uuid, fk)
- `title` (string)
- `location` (enum: `ottawa`, `montreal`, `brossard`, `laval`)
- `recordedAt` (date)
- `cameraCount` (int)
- `duration` (string — e.g. "1h 24m")
- `status` (enum: `processing`, `ready`, `scheduled`, `published`)
- `backblazeFolderPath` (string — root path for this project's files in B2)
- `shareToken` (string, unique — for public share links)
- `createdAt`

**files**
- `id` (uuid, pk)
- `projectId` (uuid, fk)
- `name` (string)
- `type` (enum: `raw`, `edited`, `clip`, `asset`)
- `mimeType` (string)
- `sizeBytes` (bigint)
- `backblazeKey` (string — full B2 path)
- `uploadedAt` (timestamp)

**transcripts**
- `id`
- `fileId` (uuid, fk — usually the edited podcast file)
- `text` (text — full transcript)
- `source` (enum: `deepgram`, `manual`)
- `deepgramRequestId` (string, nullable)
- `language` (string — ISO code)
- `paragraphsJson` (jsonb — Deepgram's structured paragraphs with timestamps)
- `createdAt`

**ai_content** (the generated metadata package)
- `id`
- `fileId` (uuid, fk)
- `title` (text)
- `description` (text)
- `chapters` (text — formatted timestamps)
- `tags` (jsonb — array of strings)
- `hashtags` (jsonb — array of strings)
- `language` (string)
- `summary` (text)
- `articlesJson` (jsonb — { linkedin, wordpress, newsletter, medium, seoBlog })
- `updatedAt`

**publish_history**
- `id`
- `fileId` (uuid, fk)
- `platform` (enum: `youtube`, `spotify`, `opusclip`)
- `action` (enum: `draft`, `scheduled`, `published`)
- `vidType` (enum: `long`, `short`, nullable — for YouTube only)
- `externalId` (string, nullable — e.g. YouTube video ID)
- `scheduledFor` (timestamp, nullable)
- `metadata` (jsonb — full snapshot of what was published)
- `createdAt`

**approvals**
- `id`
- `fileId` (uuid, fk)
- `status` (enum: `pending`, `approved`, `rejected`)
- `requestedBy` (uuid, fk → users)
- `decidedBy` (uuid, fk → users, nullable)
- `note` (text, nullable — for rejections)
- `requestedAt`
- `decidedAt`

**downloads**
- `id`
- `fileId` (uuid, fk)
- `userId` (uuid, fk)
- `downloadedAt`

**youtube_credentials** (per-user OAuth tokens)
- `userId` (uuid, fk, pk)
- `accessToken` (encrypted)
- `refreshToken` (encrypted)
- `channelId` (string)
- `channelTitle` (string)
- `expiresAt`

### 3.2 Indexes

- `users(email)`
- `projects(userId, recordedAt desc)`
- `files(projectId, type)`
- `credit_transactions(userId, createdAt desc)`
- `publish_history(fileId, platform)`

---

## 4. Authentication & authorization

### 4.1 Magic link flow

1. User enters email on `/login`
2. POST `/api/auth/signin/email` with `{ email }`
3. Server checks if user exists in `users` table
   - If not: create with default `role=client`, `plan=starter` (or block sign-ups — see §4.4)
4. Server generates a one-time token, stores it (15 min expiry), and sends an email via Resend with link: `https://app.onpod.io/api/auth/callback/email?token=...`
5. User clicks link in inbox
6. Server validates token, creates session cookie (httpOnly, secure, sameSite=lax)
7. Redirect to `/account` (client) or `/admin` (admin)

### 4.2 Session

- JWT-based session via Auth.js, 30-day expiry, auto-renewed on activity
- Session payload: `{ userId, email, role, plan }`

### 4.3 Authorization rules

Every API route checks `session.role`:

| Route prefix | Required role | Notes |
|---|---|---|
| `/api/auth/*` | public | login/logout/callback |
| `/api/projects/[id]/*` | client (own project) or admin | project ownership check |
| `/api/admin/*` | admin only | hard 403 otherwise |
| `/api/stripe/webhook` | public | verified by Stripe signature |

### 4.4 Sign-up policy

**Recommendation:** Closed sign-ups for v1. Admin invites clients via `/admin/clients` → "Invite client" button, which:
1. Creates the user row with role=client, plan=starter (no Stripe subscription yet)
2. Generates a "first-time setup" magic link
3. Sends a welcome email with the link

Public open registration introduces fraud/abuse concerns the team isn't ready to handle in v1.

### 4.5 Admin impersonation

Admins can view as any client:
- Admin clicks "Open" on a client row in `/admin/clients`
- Frontend sets `impersonateUserId` in session (admin only)
- All client-facing pages render as if logged in as that client
- A persistent banner at top of every page: "Viewing as [Client Name] — Exit impersonation"
- All write operations record `actor.id = admin.id, target.userId = client.id` for audit

---

## 5. Feature: Project & file management

### 5.1 Account page (`/account`)

**Layout:** Simple list of project folders grouped by year (desc).

**Each folder row shows:**
- Folder icon (neutral gray)
- Date and studio name (e.g. "May 11, 2026 — Laval")
- Status pill (Ready / Published / Scheduled / Processing)
- Meta: "Laval studio · 6 cameras · 1h 24m"
- Chevron arrow on the right
- Checkbox on the left for multi-select

**Multi-select bar:** When ≥1 folder selected, a floating bar appears with: Clear, Download all (bulk B2 signed URLs zipped), Share (copy public link), Archive (mark archived — soft delete).

**Click a folder row:** Navigate to `/account/projects/[id]` (the file portal — see §5.2).

**API:** `GET /api/projects` returns `{ projects: [...] }` for the current user, sorted `recordedAt desc`.

### 5.2 File portal page (`/account/projects/[id]`)

This is the main work surface — files for one session.

**Top nav:**
- "← All folders" back button
- ONPOD logo
- Settings icon
- Notifications icon
- User avatar

**Header:**
- "[LOCATION] — [DATE]" big Bebas Neue heading
- Meta: "Updated [date] · [N] files · [total size]"
- "Viewer · downloads enabled" access pill (or "Editor" for owner)

**Folder tabs** (horizontal):
- Raw Files (count)
- Edited Podcast (count)
- Clips (count)
- Assets (count)
- AI Content (count)

**Toolbar:**
- Search input
- "Request approval" button
- "Download all" button
- "Upload video" button (uploads to current folder)

**File rows** — each shows:
- Checkbox
- File-type icon (video / audio / image)
- Filename + size + last updated
- Status badges (Published / Scheduled / Approved / Downloaded — can stack)
- Per-file actions (right-side):
  - **AI button** (purple brain icon) — see §6
  - **YouTube button** (red play icon) — see §7
  - **Spotify button** (green circle icon) — see §8
  - **OpusClip button** (purple/pink scissors gradient) — see §9
  - Divider
  - **Preview** (eye icon)
  - **Download** (arrow down icon) — see §10

**Gating logic:**
- Spotify and OpusClip buttons hidden in the Clips folder (clips can't be re-clipped or RSS-published)
- All publish buttons (YouTube/Spotify/OpusClip) gated until file is approved (Edited + Clips folders only — Raw doesn't need approval since it's never published)

**APIs:**
- `GET /api/projects/[id]` returns project metadata + files grouped by type
- `GET /api/projects/[id]/files/[fileId]/signed-url` returns a short-lived Backblaze signed URL for download/preview

### 5.3 File upload

**Drag/drop and click-to-browse** on the file portal. No visible dropzone (per UX decision); drop anywhere on the page works.

**Flow:**
1. User drops .mp4 onto page
2. Frontend POSTs to `/api/projects/[id]/files/upload-init` with `{ filename, sizeBytes, mimeType, targetFolder }`
3. Server checks user has access to project, then generates a Backblaze B2 pre-signed URL for direct upload
4. Frontend uploads directly to B2 via PUT
5. On success, frontend POSTs to `/api/projects/[id]/files/upload-complete` with `{ backblazeKey }`
6. Server creates the `files` row, returns the new file object
7. Frontend prepends to the file list

**Notes:**
- Large files (>5GB) must use B2's multipart upload — frontend chunks the file
- Show upload progress bar inline
- Files appear with `uploadedAt = now()` so they sort to the top

---

## 6. Feature: AI button (transcription + content generation)

### 6.1 User flow

1. User clicks AI brain icon on a file (must be a video file)
2. **First click (idle state):**
   - Toast: "Transcription started · We'll notify you when ready"
   - AI button switches to progress ring showing live percentage
   - No modal opens
3. **While processing:**
   - Clicking the AI button again shows a toast with current progress percentage
   - The progress ring animates from 0% to 100%
4. **When ready:**
   - Green dot appears on the AI button
   - Toast: "AI content ready · Click the AI button to view"
5. **Click AI button when ready:**
   - Modal opens to "AI Studio" with 5 tabs: Metadata, Chapters, Articles, Thumbnails, Transcript

### 6.2 AI Studio tabs

**Metadata tab:**
- YouTube Title (editable input)
- YouTube Description (editable textarea, 200-300 words)
- SEO Tags (chip list, 12-15 tags, removable)
- Hashtags (chip list, 8 hashtags)
- Summary (2-3 sentence)
- Detected language indicator

Each section has:
- "Regenerate" button → full regen via Claude
- Custom prompt input ("Make it more controversial") + "Improve" button → targeted regen

**Chapters tab:**
- Textarea with formatted timestamps:
  ```
  00:00 Intro
  02:15 Topic one
  10:42 Building startups
  ```
- Must be YouTube-clickable format
- "Regenerate" button using transcript paragraph timestamps

**Articles tab:**
- 5 format chips: LinkedIn, WordPress, Medium, Newsletter, SEO Blog
- Each generates a full article in that format's style
- Editable, downloadable as `.md`, copyable to clipboard
- Each article generation deducts 1 `articles` credit

**Thumbnails tab:**
- 3 AI-generated thumbnail variants (16:9)
- "Generate new variants" (deducts 1 `coverArts` credit)
- "Extract from video" (pulls 5 frames at evenly-spaced timestamps via FFmpeg)
- "Upload custom" (manual upload to Backblaze)
- Each variant has an "Edit" button with overlay text editor

**Transcript tab:**
- Read-only full transcript display
- "Copy" and "Export SRT" buttons

### 6.3 Backend: transcription

**Endpoint:** `POST /api/transcribe`

**Request:**
```json
{
  "fileId": "uuid",
  "projectId": "uuid"
}
```

**Server logic:**
1. Verify user owns project (or is admin)
2. Check user has unused `podcasts` credit (or unlimited)
3. Get the file's B2 signed URL
4. Mark transcript status as `processing` in DB
5. Trigger background job (Firebase Functions allows up to 60min runtime; use Cloud Tasks for >9min)
6. Background job:
   - Stream the file to Deepgram's `/v1/listen` endpoint
   - Parameters: `model=nova-2&smart_format=true&punctuate=true&paragraphs=true&detect_language=true`
   - Authorization: `Token DEEPGRAM_API_KEY`
   - Wait for response (typically 1-5 min for a 1-hour podcast)
   - Parse: extract `results.channels[0].alternatives[0].transcript` and `paragraphs.paragraphs[]`
   - Save to `transcripts` table
   - Increment `credits.podcastsUsed`
   - Log to `credit_transactions`
   - Trigger AI content generation (next step) in another background job
7. Frontend polls `/api/transcribe/[fileId]/status` every 2s during processing, or uses Firestore real-time listener / websocket

**Cost per transcription:** ~$0.20 per 45-min podcast at Deepgram Nova-2 rates ($0.0043/min).

### 6.4 Backend: AI content generation

**Endpoint:** `POST /api/ai/generate-full`

**Triggered automatically** when transcript completes. Also exposed for re-runs.

**Server logic:**
1. Load transcript text
2. Send to Claude API with this prompt:

```
You are a podcast content strategist for OnPod Studios. Based on this 
podcast transcript, generate a complete YouTube + content package. 
Return ONLY valid JSON, no preamble, no markdown fences.

Transcript:
{transcript}

Return JSON with this exact shape:
{
  "title": "compelling YouTube title under 70 chars",
  "description": "engaging 200-300 word YouTube description with hook, 
                  key takeaways, and CTA",
  "tags": ["tag1", "tag2", ...] (12-15 SEO tags),
  "hashtags": ["#hashtag1", ...] (8 hashtags),
  "language": "English",
  "chapters": "00:00 Intro\n02:15 Topic one\n..." (use real timestamps 
              from the transcript paragraphs),
  "summary": "2-3 sentence summary"
}
```

3. Parse JSON, validate shape
4. Save to `ai_content` table
5. Return the package to the frontend

**Model:** `claude-sonnet-4-20250514` (or latest Sonnet)
**Max tokens:** 2000
**Cost:** ~$0.05 per podcast

### 6.5 Backend: Section regeneration

**Endpoint:** `POST /api/ai/regenerate-section`

**Request:**
```json
{
  "fileId": "uuid",
  "field": "title" | "description" | "tags" | "hashtags" | "chapters" | "summary",
  "customPrompt": "optional user-provided direction"
}
```

Sends a focused prompt to Claude asking for just that one field. Updates DB. Returns new value.

### 6.6 Backend: Article generation

**Endpoint:** `POST /api/ai/generate-article`

**Request:**
```json
{
  "fileId": "uuid",
  "format": "linkedin" | "wordpress" | "newsletter" | "medium" | "seo-blog"
}
```

**Server logic:**
1. Check user has unused `articles` credit
2. Build format-specific prompt (see "articleStyleGuide" in current HTML for tone instructions per format)
3. Call Claude, return article markdown
4. Save to `ai_content.articlesJson[format]`
5. Increment `credits.articlesUsed`
6. Log transaction

---

## 7. Feature: YouTube button (real OAuth upload)

### 7.1 Setup (one-time, per OnPod organization)

1. Create Google Cloud project at console.cloud.google.com
2. Enable YouTube Data API v3
3. Create OAuth 2.0 Client ID:
   - Application type: Web application
   - Authorized redirect URI: `https://app.onpod.io/api/youtube/callback`
4. Submit app for OAuth verification (Google requires this for >100 users) — takes 1-4 weeks
5. Store `YOUTUBE_CLIENT_ID` and `YOUTUBE_CLIENT_SECRET` in Firebase Functions config

### 7.2 User flow

**First time (not connected):**
1. User clicks YouTube button on a file
2. Modal opens. If `youtube_credentials` row doesn't exist for user → show "Connect YouTube" CTA
3. User clicks "Connect YouTube" → opens new tab to Google OAuth consent screen
4. User picks their YouTube channel and grants scopes:
   - `https://www.googleapis.com/auth/youtube.upload`
   - `https://www.googleapis.com/auth/youtube`
5. Google redirects to `/api/youtube/callback?code=...`
6. Server exchanges code for `access_token` + `refresh_token`
7. Server fetches user's channel info (channel ID + title) via `youtube.channels.list({mine:true})`
8. Save to `youtube_credentials` table (tokens encrypted at rest)
9. Tab closes, modal refreshes to show connected state

**Subsequent uses:**
1. User clicks YouTube button
2. Modal opens with full form (see §7.3)
3. AI-generated metadata pre-fills the form
4. User edits as needed
5. User picks Video type (long / Short), Visibility, Playlist, Schedule date, etc.
6. User clicks "Publish now" or "Schedule"
7. Frontend POSTs to `/api/youtube/upload`
8. Server:
   - Refreshes access token if expired
   - Streams the file from B2 → YouTube Data API v3 `videos.insert` (resumable upload)
   - Sets all metadata (title, description, tags, language, etc.)
   - If scheduled: sets `status.privacyStatus = 'private'` and `status.publishAt = scheduledTime`
   - Returns the YouTube video ID
9. Save to `publish_history` table
10. Frontend shows success toast + the row's file gets a "Published" badge

### 7.3 Modal form fields

- **Channel info card:** Avatar + channel name + "Switch account" button
- **Banner:** "AI-generated metadata loaded. Edit before publishing." (green) OR "No AI content yet" warning (amber)
- **Title** (text input, 100 char max)
- **Description** (textarea, 5000 char max — includes chapters at bottom)
- **Publish mode** (dropdown):
  - Publish immediately
  - Schedule for later
  - Save as private
- **Schedule date/time** (custom date picker showing conflicts — see §7.4)
- **Video type** (toggle): Regular video / YouTube Short
- **Visibility** (3-button toggle): Public / Unlisted / Private
- **Playlist** (dropdown of user's playlists, fetched via API)
- **Category** (dropdown: Education / People & Blogs / Tech)
- **Language** (dropdown — 80+ YouTube languages with English/French/Spanish pinned at top)
- **Thumbnail** (upload or use AI-generated)
- **Tags** (chip list, max 500 chars total)
- **Publishing calendar** (at bottom — see §7.5)

### 7.4 Smart date picker

Custom picker (HTML5 datetime-local doesn't support per-date disabling):

- Calendar grid for the selected month
- Days with existing content of the same `vidType` (long or Short) get a small amber dot indicator under the date
- Past dates are disabled
- Switching the Video type toggle (Long/Short) re-renders the calendar to show conflicts for the new type
- Tooltip on conflicted days: "Conflict: another Short on this day"

### 7.5 Publishing calendar widget

Shown at the bottom of the YouTube modal. Compact month grid:
- 7-column grid (Sun-Sat)
- Each day cell: ~54px tall, shows the date number + colored bars
- Colored bars represent posts:
  - Solid green = published video
  - Solid amber = scheduled video
  - Solid gray = draft
  - **Outlined** version of any color = YouTube Short
- Up to 4 bars per day, then "+N" overflow
- Today is bordered red
- Legend at bottom
- Month nav arrows

Data source: `publish_history` table filtered by `platform=youtube` for the current user.

---

## 8. Feature: Spotify button (RSS XML generation)

### 8.1 Reality check

Spotify does not offer a publishing API for general podcast creators. Spotify polls the RSS feed of registered podcasts every ~1 hour. **Our job:** generate the per-episode `<item>` XML block that the user appends to their feed.

### 8.2 One-time setup

The user needs:
1. A hosted RSS feed XML file at a stable URL (e.g. `https://feeds.onpod.io/{showSlug}.xml`)
2. That feed registered with Spotify Podcasters (free, manual, one-time)
3. Same with Apple Podcasts Connect (one-time)
4. After registration, all three platforms (and ~30 others using the feed) auto-update on each poll

### 8.3 User flow

1. User clicks Spotify icon on a file
2. Modal opens showing:
   - Show info (title, RSS feed URL, distribution destinations)
   - Episode title (pre-filled from AI content)
   - Episode description (pre-filled)
   - Season + episode number inputs
   - Audio file source dropdown ("Audio_Master_Stereo.wav (auto-extracted)" or "Upload custom")
   - Episode artwork dropdown
   - Publish mode (immediately / schedule / draft)
3. User clicks "Push to RSS feed"
4. Server generates the `<item>` XML
5. Modal switches to show the XML in a read-only textarea with:
   - Banner: "Append inside your `<channel>` tag on your existing feed"
   - Banner: "Update enclosure url with actual MP3 URL after upload"
   - Copy button
   - Download `.xml` button

### 8.4 XML format

```xml
<item>
  <title><![CDATA[Episode Title]]></title>
  <description><![CDATA[Full description]]></description>
  <itunes:summary><![CDATA[Short summary]]></itunes:summary>
  <itunes:author>Jeremy Prudhomme</itunes:author>
  <itunes:image href="https://onpod.io/cover.png"/>
  <itunes:duration>00:45:00</itunes:duration>
  <itunes:explicit>false</itunes:explicit>
  <itunes:episodeType>full</itunes:episodeType>
  <pubDate>Sun, 11 May 2026 14:00:00 GMT</pubDate>
  <guid isPermaLink="false">onpod-{fileId}-{timestamp}</guid>
  <enclosure url="https://feeds.onpod.io/audio/{fileId}.mp3" length="0" type="audio/mpeg"/>
  <link>https://onpod.io</link>
</item>
```

### 8.5 V2 enhancement (optional)

Automate the feed update: instead of user copy-pasting, we host the full feed XML on our side, and "Push to RSS" appends the item to our managed feed and re-renders the file. User points Spotify at our managed URL. This requires:
- A `podcast_shows` table for show-level metadata
- A `GET /feeds/[showSlug].xml` endpoint that generates the full feed from DB on every request
- Cache headers (5min) so we don't regenerate constantly

---

## 9. Feature: OpusClip button (short clip generation)

### 9.1 Architecture

OpusClip has a partner API (apply at opus.pro). We use OnPod's **centralized account** — clients never sign into OpusClip directly. This means:
- One OnPod-wide OpusClip API key, stored in env vars
- We track usage per user via our own `credits.opusClipsUsed` counter
- Generated clips download back to Backblaze in the project's `clips/` folder
- Clients see only the result, not the OpusClip dashboard

### 9.2 User flow

1. User clicks OpusClip icon on a video file
2. Modal opens with style picker (3 options):
   - **OnPod Bold** — High-contrast, animated word highlights
   - **Minimal** — Subtle captions, speaker focus
   - **Viral Hook** — Hook-first, emoji captions, fast cuts
3. Form fields:
   - Aspect ratio (9:16 / 1:1 / 16:9)
   - Number of clips (Auto 5-10 / 3 / 5 / 10 / 15)
   - Clip duration (15-30s / 30-60s / 60-90s)
   - Branding preset (OnPod default / No branding / Custom logo)
4. User clicks "Generate clips"
5. Server:
   - Checks user has 1 unused `opusClips` credit
   - Gets B2 signed URL for source video
   - Calls OpusClip API: `POST /v1/clips` with `{source_url, style_template_id, aspect_ratio, count, branding}`
   - Stores the OpusClip job ID in our DB
6. Modal closes, toast: "Clips submitted to OpusClip · You'll be notified when ready"
7. Background: OpusClip processes (8-15 minutes typical)
8. OpusClip calls our webhook: `POST /api/opus/webhook` with `{job_id, status, clips:[{url, duration}]}`
9. Webhook handler:
   - Downloads each clip from OpusClip's CDN
   - Uploads to B2 under `{projectPath}/clips/`
   - Creates `files` rows
   - Increments `credits.opusClipsUsed`
   - Sends email notification to user via Resend: "Your X clips are ready"
10. Next time user opens project → clips folder has the new files

### 9.3 Failure handling

- If OpusClip API call fails: refund the credit, show error
- If webhook doesn't fire within 30 min: poll `/v1/jobs/{id}` every 5 min for status
- If user closes browser during gen: doesn't matter; webhook still completes async

---

## 10. Feature: File downloads & tracking

### 10.1 User flow

1. User clicks the download icon on a file row
2. Frontend POSTs to `/api/files/[fileId]/download`
3. Server:
   - Verifies user owns project
   - Generates a B2 pre-signed URL (15 min expiry)
   - Inserts a row into `downloads` table
   - Returns the signed URL
4. Frontend triggers browser download via the signed URL
5. The file row updates to show:
   - Download arrow turns green
   - "Downloaded" badge appears next to file size
   - On 2nd+ download: badge becomes "N downloads" with the count

### 10.2 "Download all" (bulk)

For the project-level "Download all" button OR multi-select bulk download:

**Two options:**

**A) Browser ZIP (simpler):** Generate a list of signed URLs, frontend downloads each and zips client-side using a library like JSZip. Works for small projects (<2GB).

**B) Server ZIP (better):** Endpoint that streams a ZIP archive built from B2 files. Use `archiver` npm package on Firebase Functions. Better UX, single browser download, but uses function compute time.

Recommendation: A for v1 (simpler), B for v2 if clients complain.

---

## 11. Feature: Approval workflow

### 11.1 Logic

Only applies to **Edited Podcast** and **Clips** folders. Raw files don't need approval. The flow:

- New file in Edited or Clips folder → no approval status, "Approve" outline button shown
- Studio clicks the toolbar "Request approval" button → drafts an email + flips all unapproved files to "Pending"
- Client receives email with share link → opens portal → clicks approval toggle to approve
- Once approved: publish buttons (YouTube/Spotify) unlock for that file

### 11.2 "Request approval" email flow

1. User (studio) clicks toolbar "Request approval" button
2. Server finds all unapproved files in Edited + Clips folders
3. Marks them all as `pending` in `approvals` table
4. Returns a draft email:
   - Subject: "Please review your podcast files — [PROJECT TITLE]"
   - Body lists files + share link + instructions
5. Modal opens with editable email composer (To, Subject, Body)
6. User edits, clicks "Send email"
7. Server sends via Resend to client's email address
8. Email contains a link to the share view (`/share/{shareToken}`) with the files

### 11.3 Approval toggle behavior

- **Default (no approval status):** outline gray button "Approve"
- **Pending:** purple "Awaiting review" with clock icon
- **Approved:** green checkmark, row tints green, publish buttons unlock
- **Rejected:** red X "Changes requested"

Clicking the toggle on the file:
- If logged in as the client → marks approved (or un-approves)
- If logged in as studio → "studio override" approval (e.g. client gave verbal approval)

### 11.4 Publish gating

Frontend: publish buttons (YouTube/Spotify) show as `.gated` (50% opacity, not-allowed cursor) when `needsApproval && !isApproved`. Clicking shows toast: "Awaiting client approval before publishing."

Backend: every publish endpoint also enforces the rule server-side (frontend gating is just UX, never trust it for security).

---

## 12. Feature: Admin panel

### 12.1 Routes

- `/admin/clients` — Client list table
- `/admin/clients/[id]` — Single client view (manage plan/credits)
- `/admin/projects` — All projects across all clients
- `/admin/revenue` — MRR/ARR dashboard
- `/admin/settings` — API integrations status, plan pricing

### 12.2 Client list

Columns: Avatar+Name+Email, Plan, Credit usage %, MRR, Joined date, Actions

Actions per row: "Open" (impersonate the client — see §4.5), "Manage" (open credit/plan modal)

Top-right button: "Invite client" → modal asking for email + first/last name + initial plan. Sends magic link.

### 12.3 Manage client credits modal

- Plan selector (Starter / Pro / Authority / Unlimited)
- Current usage display (read-only)
- Bonus credit inputs (+ podcasts, + articles, + OpusClip, + cover arts)
  - Bonus credits don't reset monthly — they persist until consumed
- "Save changes" applies plan change + bonus grants to `credits` and `users` tables

### 12.4 All projects view

Same as client's projects list but unfiltered, with extra columns showing which client each belongs to. Filters: by location, by status, by date range.

### 12.5 Revenue dashboard

Real Stripe data (queried via Stripe API on page load, cached 5min):
- Total MRR (sum of active subscriptions)
- ARR (MRR × 12)
- Avg revenue per client
- Churn % (30-day)
- Plan distribution table (count per plan + revenue contribution)

V2: charts via Recharts, cohort retention, expansion revenue tracking.

---

## 13. Feature: Stripe billing

### 13.1 Products & prices in Stripe dashboard

Create 3 products, each with a single recurring monthly price:
- `prod_starter` → `price_starter_monthly` ($299 CAD/mo)
- `prod_pro` → `price_pro_monthly` ($699 CAD/mo)
- `prod_authority` → `price_authority_monthly` ($1,499 CAD/mo)

Store the price IDs in env vars: `STRIPE_PRICE_STARTER`, etc.

### 13.2 Upgrade flow (client-initiated)

1. Client clicks "Upgrade plan" in their portal
2. Modal opens with 3 plan cards, current plan highlighted
3. Client selects desired plan, clicks "Continue to Stripe"
4. Frontend POSTs to `/api/stripe/create-checkout-session` with `{ priceId }`
5. Server:
   - Creates/retrieves Stripe customer for this user
   - Creates Checkout session with `mode='subscription'`, `success_url=/account?upgraded=true`, `cancel_url=/account`
   - Returns the session URL
6. Frontend redirects browser to the Stripe URL
7. Client completes checkout in Stripe-hosted flow
8. Stripe redirects back to `success_url`
9. Webhook fires (see §13.3)

### 13.3 Webhook handlers

**Endpoint:** `/api/stripe/webhook` (Stripe-signed)

Handle these events:

| Event | Action |
|---|---|
| `checkout.session.completed` | Update user's plan in DB, store `stripeSubscriptionId` |
| `customer.subscription.updated` | Update plan if changed, reset credits if it's monthly renewal |
| `customer.subscription.deleted` | Downgrade to `starter` or block access (decide policy) |
| `invoice.payment_failed` | Email client; if 3 failures, suspend account |
| `invoice.payment_succeeded` | Reset monthly credits to plan max |

### 13.4 Self-serve management

Stripe Customer Portal handles cancellations, plan changes, payment method updates:
1. Client clicks "Manage billing" in portal
2. Frontend POSTs to `/api/stripe/create-portal-session`
3. Server creates portal session, returns URL
4. Frontend redirects to Stripe portal
5. Webhooks pick up any changes (see §13.3)

### 13.5 Monthly credit reset

Cron job (Firebase Scheduled Function) runs daily at 00:00 UTC:
1. Find all users where `creditsResetAt <= now()`
2. Reset their `credits.*Used` counters to 0
3. Set `creditsResetAt = now() + 1 month`
4. Log to `credit_transactions` with `type='reset'`

---

## 14. Settings page

User-accessible at `/settings`:

- **Profile:** Name, avatar (auto-generated initials, color picker)
- **Email preferences:** Notifications toggles (approval requests, clips ready, etc.)
- **Billing:** Current plan, "Manage billing" button (→ Stripe portal)
- **API connections (client):**
  - YouTube — connect/disconnect (re-auth)
- **API connections (admin only):**
  - Deepgram key (env var status check)
  - Claude key (env var status check)
  - OpusClip key (env var status check)
  - Stripe webhook secret (env var status check)
- **Danger zone:** Delete account (soft-delete; admin can restore for 30 days)

---

## 15. Email templates (Resend)

All emails use a shared HTML template with OnPod branding (purple→pink gradient ONPOD wordmark, dark background).

| Template | Trigger | Audience |
|---|---|---|
| `magic-link.html` | Login request | Anyone signing in |
| `welcome.html` | First magic link for new user | Newly invited clients |
| `approval-request.html` | Studio sends approval request | Client (recipient) |
| `clips-ready.html` | OpusClip webhook fires | Client (project owner) |
| `payment-failed.html` | Stripe payment failure | Client |
| `transcription-ready.html` (optional) | Deepgram completes | Client |

All templates support template variables: `{{firstName}}`, `{{projectTitle}}`, `{{linkUrl}}`, etc.

---

## 16. Environment variables

Required in deployment:

```
# Auth
NEXTAUTH_SECRET=<random 32-char string>
NEXTAUTH_URL=https://app.onpod.io

# Database
DATABASE_URL=<postgres connection string>
# OR if Firestore: FIREBASE_SERVICE_ACCOUNT_JSON

# Backblaze
B2_KEY_ID=<your key ID>
B2_APPLICATION_KEY=<your application key>
B2_BUCKET=onpod-recordings
B2_ENDPOINT=https://s3.us-west-002.backblazeb2.com

# Deepgram
DEEPGRAM_API_KEY=<key>

# Anthropic (Claude)
ANTHROPIC_API_KEY=<key>

# YouTube OAuth
YOUTUBE_CLIENT_ID=<from Google Cloud>
YOUTUBE_CLIENT_SECRET=<from Google Cloud>

# OpusClip (partner)
OPUSCLIP_API_KEY=<key>

# Stripe
STRIPE_SECRET_KEY=<key>
STRIPE_WEBHOOK_SECRET=<from Stripe webhook config>
STRIPE_PRICE_STARTER=price_xxx
STRIPE_PRICE_PRO=price_xxx
STRIPE_PRICE_AUTHORITY=price_xxx

# Resend
RESEND_API_KEY=<key>
RESEND_FROM_EMAIL=hi@onpod.io
```

---

## 17. Visual design system

The HTML demo (`onpod-distribution-platform.html`) is the canonical reference for all visual styling. Key elements:

- **Colors:**
  - Background: `#0a0a0b`
  - Elevated surfaces: `#131316`, `#1c1c20`, `#26262c`
  - Accent (action red): `#ff3b30`
  - Brand gradient: `linear-gradient(135deg, #a855f7 0%, #ec4899 100%)` — for logo
  - Status colors: success `#10b981`, warning `#f59e0b`, danger `#ef4444`, info `#60a5fa`
- **Typography:**
  - Display: `'Bebas Neue'` (headings, status labels, large numbers)
  - Body: `'Poppins'`, weights 300-800
- **Spacing:** 4px base unit. Common: 8, 12, 16, 20, 24, 32px
- **Border radius:** `8px` (small), `12px` (default), `16px` (cards), `20px` (modals)
- **Shadows:** `0 8px 24px rgba(0,0,0,0.4)` for floating elements, `0 12px 32px rgba(0,0,0,0.5)` for modals
- **Logo:** ONPOD wordmark, purple-to-pink gradient

The developer should treat the HTML demo as a working pixel-accurate mockup. Re-implementing in React + Tailwind should match it visually.

---

## 18. Development phases (recommended order)

### Phase 1: Foundation (Week 1-2)
- Next.js project setup
- Auth.js with magic link + Resend
- Database schema + migrations
- Basic `/account` page (project list, no real data)
- Admin role middleware

### Phase 2: File handling (Week 2-3)
- Backblaze B2 integration (signed URLs, upload, list)
- `/account/projects/[id]` file portal
- File row UI with all action buttons (non-functional)
- Download tracking

### Phase 3: AI button (Week 3-5)
- Deepgram proxy endpoint + background job
- Claude content generation
- AI Studio modal with all 5 tabs
- Section regeneration with custom prompts
- Article generation in 5 formats
- Credit deduction logic

### Phase 4: Approval & publishing prep (Week 5-6)
- Approval workflow
- Email composer modal
- Resend integration
- Publish gating logic

### Phase 5: YouTube (Week 6-8)
- Google OAuth flow + token storage
- Video upload via Data API v3
- Schedule picker with conflict detection
- Publishing calendar widget
- Publish history tracking

### Phase 6: Spotify RSS (Week 8-9)
- RSS XML generation
- Modal flow
- (Optional) Managed feed hosting

### Phase 7: OpusClip (Week 9-10)
- OpusClip API integration
- Webhook handling
- Clips delivery back to B2

### Phase 8: Billing (Week 10-11)
- Stripe products setup
- Checkout flow
- Customer portal
- Webhook handling
- Monthly credit reset cron

### Phase 9: Admin panel (Week 11-12)
- Client list with credit management
- Project list across clients
- Revenue dashboard
- Impersonation flow

### Phase 10: Polish & QA (Week 12-13)
- End-to-end testing
- Error states everywhere
- Email templates polished
- Production deploy
- Monitoring (Sentry, Logtail)

**Total estimate:** 12-13 weeks for one experienced full-stack dev, or 8-10 weeks for a team of two.

---

## 19. Out of scope for v1

These are explicitly NOT in the first release:

- Multi-language UI (English only)
- Mobile app (responsive web only)
- Real-time collaboration (multiple users editing one project simultaneously)
- Public sharing of full episodes beyond approval flow
- Automatic social posting (TikTok, Instagram, LinkedIn direct publishing)
- Analytics dashboard (podcast performance tracking)
- CRM integration (GoHighLevel sync)
- White-label / multi-brand support
- AI virality scoring
- Custom thumbnail editor (use AI generation only for v1)

---

## 20. Open questions for the developer

These need decisions before/during build:

1. **Firebase vs Vercel:** Client is currently on Firebase. Vercel is more idiomatic for Next.js. Recommend reviewing trade-offs with Jeremy.
2. **Firestore vs Postgres:** Firestore is fine if staying on Firebase but lacks transactional integrity for credit deduction. Recommend Postgres regardless.
3. **OpusClip API access:** Verify availability of partner API and pricing model before architecting Phase 7. If unavailable, scope falls back to manual export.
4. **YouTube OAuth verification:** Google's verification can take 1-4 weeks. Submit early in Phase 5.
5. **Spotify feed hosting:** Decide whether OnPod hosts feeds (more work, better UX) or clients append to their own.
6. **Background job runtime:** Firebase Functions tops out at 60 min. Long transcriptions or clip generation may need Cloud Tasks or migration to a service like Inngest.

---

## 21. Contact

**Product owner:** Jeremy Prudhomme
**Email:** jeremy@onpod.io
**Visual reference:** `onpod-distribution-platform.html` (current HTML demo)
**Brand assets:** OnPod logo (purple-to-pink gradient ONPOD wordmark)

End of spec.
