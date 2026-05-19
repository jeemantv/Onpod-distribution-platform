# OnPod Distribution Platform

Scaffolded Next.js 14 (App Router) app from `ONPOD-PLATFORM-SPEC.md`. All external integrations (Stripe, Deepgram, Claude, YouTube, Backblaze, Resend, OpusClip) are **mocked** — API routes return fake data and no keys are required to run.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Demo login

Magic-link flow is mocked. Enter any email at `/login`:
- `admin@onpod.io` → signs in as admin (`/admin/clients`)
- anything else → signs in as a client (`/account`)

The session is a plain cookie (`onpod_session`). No real auth.

## Structure

```
src/
  app/
    (auth)/login/
    (client)/account/
    (client)/account/projects/[id]/
    (client)/settings/
    (admin)/admin/clients/
    (admin)/admin/projects/
    (admin)/admin/revenue/
    (admin)/admin/settings/
    api/                # mock endpoints
  components/           # reusable UI
  lib/                  # mock data, types, session helper
```

## Replacing the mocks

Each `src/app/api/*/route.ts` has a `// TODO:` marker pointing at the spec section it implements. Swap mock data for real service calls when keys are available.
