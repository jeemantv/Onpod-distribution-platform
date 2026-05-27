# OnPod — open work

Living todo list. Sorted roughly by impact. Strike through (`~~item~~`)
or remove when done.

---

## Now-ish (real user pain)

### n8n: MP3 sibling extraction for Buzzsprout publishing

**Why**: Buzzsprout's "processing" state can run 15–30 min on big MP4
uploads because they download the whole video file from B2, then extract
audio themselves. Handing them a tiny MP3 drops that to seconds.

**App side**: already done — `/api/buzzsprout/publish` now looks for
`<videoKey>.mp3` (or `.m4a`) next to the canonical video. When present,
uses that URL. Falls back to the MP4 if missing. The `publish_history`
metadata records `sentAudioOnly: true|false` so we can confirm in the
DB which path each episode took.

**n8n side (TODO)**:
- Add a node to the existing "edit finalized" workflow that runs
  ffmpeg-style audio extraction on the final video.
- Command: `ffmpeg -i input.mp4 -vn -ar 44100 -ac 2 -b:a 192k output.mp3`
  (192kbps stereo, 44.1kHz — clean podcast quality, ~80MB per 90min).
- Upload as a sibling next to the video, same prefix, with `.mp3`
  suffix. The B2 key should be: `<videoKey>.mp3` (literally append).
  Example: `clients/alice@example.com/2026-05-15-podcast/EDIT_final.mp4.mp3`.
- Run it AFTER the file appears in B2 — don't gate the original upload.
- Optional: also drop `.m4a` if Buzzsprout's MP3 transcoding is slow.

**How to verify after wiring**: publish an episode, then check
`publish_history.metadata.sentAudioOnly` in Postgres. Should be `true`
for any episode published after n8n is live.

---

### Buzzsprout status polling in the modal

**Why**: Right now the modal hits success and shows a "Open on
Buzzsprout" link. The actual episode is still processing, but we don't
tell the user — they think it's broken when it's just queued.

**TODO**:
- New route `/api/buzzsprout/episodes/<id>/status` that calls
  Buzzsprout's GET `/api/<podcast_id>/episodes/<id>.json`.
- Modal polls every ~5s for the first minute, then every 30s for 10
  min, then stops. Shows "Downloading from storage…", "Encoding…",
  "Live on Spotify, Apple, Amazon".
- After "Live", surface the per-platform URLs (Spotify/Apple) from
  Buzzsprout's `directories` field.

---

### Resend domain verification

**Why**: Sandbox `onboarding@resend.dev` only delivers to verified
addresses. Right now most signup emails don't land in real inboxes.

**TODO**:
- Verify `onpod.io` (or pick another sender domain) in Resend dashboard.
- Add DNS records: SPF / DKIM / DMARC.
- Set `RESEND_FROM_EMAIL=hi@onpod.io` in Vercel env.
- Send a test invite, confirm landing in inbox not spam.

**Workaround until then**: `npx tsx scripts/mint-link.ts <email>` mints
a magic link locally, paste into browser. Test-only.

---

### Verify `ONPOD_SERVICE_KEY` in prod env

**Why**: n8n hits `/api/admin/clients/invite` with a service-token
header. If the env var isn't set, the header check returns false and
n8n calls fail with 401.

**TODO**:
- Run `vercel env ls | grep ONPOD_SERVICE_KEY`.
- If unset: generate a random string, add as production env, share with
  the n8n flow.

---

## Soonish (polish)

### Real Stripe revenue on `/admin/revenue`

**Now**: page sources from in-memory `mockUsers`. Copy clarifies it's
demo data.

**TODO**: query Stripe via API for the current month's MRR / churn /
new subs. Cache to a `revenue_snapshots` table once a day to avoid
hammering Stripe.

---

### File status badges + preview/calendar use new custom statuses

**Now**: The Monday-style status dropdown is live and writes the new
`statusId` to file_meta. When user picks one of the seeded statuses
(Approved / In revision / Ready for approval), we mirror to the legacy
`approvalStatus` enum so the existing badges still render.

**Gap**: Custom statuses (e.g. "Shipped", "Awaiting client") don't
appear on `FileStatusBadges` or the publishing calendar. They show in
the dropdown only.

**TODO**:
- `FileStatusBadges`: read `statusId` first, fall back to enum.
- Publishing calendar: color by `statusId` + show custom labels.

---

### Audit attribution for custom statuses + meta changes by guests

**Now**: Revision-note creation + done-flips correctly attribute to the
guest editor's email/name (not the host client's). Good.

**Gap**: File-meta changes (statusId, type changes) still attribute to
the session user — which is the host client when a guest is acting.

**TODO**: Extend `setFileMetaEntry` to accept an optional `actorEmail`
and store it in a small audit log table. Display in a "history" tab on
the preview modal.

---

### MP3 download button in the Buzzsprout modal

**Why**: Users sometimes want the audio-only file for upload elsewhere
(Patreon, YouTube as audio-only, etc.). Once n8n drops `.mp3` siblings,
exposing a download button is trivial.

**TODO**:
- "Download MP3" button on the Buzzsprout modal.
- Only renders when `<videoKey>.mp3` exists (HEAD check).
- Returns a signed B2 URL.

---

## Documented + parked (not breaking anyone)

| Severity | Item |
|---|---|
| Med | `stripeCustomerId` not cleared on `customer.subscription.deleted`. Edge case — only matters if customer is hard-deleted in Stripe dashboard. Re-subscribe still works otherwise. |
| Med | Magic-link token race on simultaneous redemption. Two concurrent requests could both pass expiry check; benign (same user). Postgres `READ COMMITTED` permissive. |
| Low | Publish capability for guest editors. Right now guests can publish to YouTube/Buzzsprout using the host client's connections. Matches "everything an in-house editor can do" but is a real impersonation surface. Add a gate if you want to block it. |
| Low | Rotate stale test secrets: Vizard key, Stripe test secret, Resend test key — all surfaced in chat at various points. Treat as compromised; rotate when going live. |

---

## Done since the last QA pass

- ✅ Vizard template lock server-side enforcement (was client-only)
- ✅ AI cover-art + article routes resolve active version (was reading v1)
- ✅ Vizard webhook idempotency guard
- ✅ Super-admin scope check on `/admin/revenue` + `/admin/settings`
- ✅ Buzzsprout integration: per-client creds, publish + draft + schedule, inline connect, artwork upload, localStorage draft autosave, MP3-sibling-preferred publish path
- ✅ Customizable per-studio file status dropdown (Monday-style)
- ✅ Approval email: selected files only, actually sends via Resend
- ✅ Assign editor from `/admin/clients` (per-row dropdown)
- ✅ Default editor per studio + auto-assign on new client
- ✅ External (guest) editor flow + permanent guest sign-in URL
- ✅ 7-day free trial for new clients
- ✅ Billing flow: working Manage button, post-checkout success card with back-to-dashboard, fresh plan picked up immediately
- ✅ Plan tag reflects effective plan + trial state
- ✅ Studio referral CTA on externals clients' `/account`
- ✅ Publish modals don't auto-fill garbage when transcript missing
