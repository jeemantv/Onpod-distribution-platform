# OnPod — Smoke Test Suite

API-level smoke tests covering high-traffic surfaces and the bug classes
that have caused regressions (auth gates, scoped-admin scoping, plan
gating, recent feature additions).

## Running

```sh
# Against production
npm run test:prod

# Against a local dev server (start `npm run dev` first)
npm run test:local

# Against an arbitrary base URL
TEST_BASE_URL=https://your-preview.vercel.app npm test
```

Tests run with Node's built-in `node:test` runner via `tsx`. No
Playwright, no browser, no fixtures — just `fetch` + assertions. Total
runtime is ~20s against production.

## What's covered

| Suite | Surface |
|---|---|
| Public surfaces | `/`, `/login`, `/signup`, `/invite/[token]` |
| Auth | signin (good + bad password), magic-link request (incl. no-enumeration), magic-link verify (bad token) |
| Admin auth gates | invite, studios — for anonymous + client roles |
| Studio routes | list studios, PATCH unknown, list invites |
| Plan gating | client youtube/me responds (sanity) |
| File routes | `/api/files/zip` auth + validation |
| Stripe | checkout + webhook contract (stripe not configured → graceful) |
| Vizard / Opus | templates list, start validation |
| Admin pages render | clients, studios, team, integrations |
| Client pages render | /account, /settings/billing |

## What's NOT covered

These are intentional gaps — they require side effects on real DB / B2:

- **Invite acceptance flow** (would create real users in DB)
- **File upload completion** (would write to B2)
- **Vizard job submission** (would call paid Vizard API)
- **Stripe checkout creation** (requires fully-configured Stripe — currently 503)
- **YouTube OAuth callback** (requires interactive auth)
- **Full UI rendering** (would need Playwright; current tests verify HTML response only)

## When to add a test

Every time you add a new API route or change an auth gate, add a smoke
test for it. The cheapest format:

```ts
test("POST /api/your/route — anonymous is 401", async () => {
  const r = await hit("/api/your/route", { method: "POST", body: "{}" });
  assert.equal(r.status, 401);
});
```

The `hit` and `signIn` helpers in `smoke.test.ts` handle session
cookies for you.

## When to run

- **Before pushing** any code that touches API routes
- **After every deploy** as a smoke check that prod isn't broken
- Ideally wired into CI (Vercel doesn't run tests pre-deploy by
  default — you'd add a GitHub Action calling `npm run test:prod`
  after a successful deploy)
