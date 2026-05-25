// OnPod smoke test suite. Runs against any base URL — production by
// default; pass TEST_BASE_URL to override (e.g. http://localhost:3000).
//
// Goals:
//   1. Verify the high-traffic surfaces respond (no 500s, right status codes)
//   2. Cover the auth + invite + scoping + Stripe routes that have caused
//      regressions in the past
//   3. Run in <30s so it can be wired into CI / pre-deploy hooks
//
// Run:  npx tsx --test tests/smoke.test.ts
// or:   TEST_BASE_URL=http://localhost:3000 npx tsx --test tests/smoke.test.ts

import { test, describe } from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.TEST_BASE_URL ?? "https://onpod.vercel.app";

// Demo credentials seeded into the DB. If you re-seed and the password
// changes, update here.
const DEMO_ADMIN = { email: "admin@onpod.io", password: "demo" };
const DEMO_CLIENT = { email: "client@onpod.io", password: "demo" };

// --- helpers ----------------------------------------------------------

interface FetchResult {
  status: number;
  ok: boolean;
  headers: Headers;
  cookie: string | null;
  text: string;
  json: unknown;
}

async function hit(
  path: string,
  init: RequestInit & { cookie?: string } = {},
): Promise<FetchResult> {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set("cookie", init.cookie);
  const res = await fetch(`${BASE}${path}`, { ...init, headers, redirect: "manual" });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  return {
    status: res.status,
    ok: res.ok,
    headers: res.headers,
    cookie: res.headers.get("set-cookie"),
    text,
    json,
  };
}

async function signIn(
  email: string,
  password: string,
): Promise<{ cookie: string; user: { id: string; role: string } }> {
  const res = await hit("/api/auth/signin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(res.status, 200, `signin ${email} expected 200 got ${res.status}: ${res.text.slice(0, 200)}`);
  const cookie = res.cookie;
  assert.ok(cookie, "signin should set a session cookie");
  const sessionCookie = cookie.split(";")[0]; // strip Max-Age etc.
  const data = res.json as { user?: { id: string; role: string } };
  assert.ok(data?.user, "signin response missing user");
  return { cookie: sessionCookie, user: data.user };
}

// --- public surfaces --------------------------------------------------

describe("Public surfaces", () => {
  test("GET / returns 200 (or auth redirect)", async () => {
    const r = await hit("/");
    assert.ok([200, 302, 307].includes(r.status), `unexpected status ${r.status}`);
  });

  test("GET /login renders the login page shell", async () => {
    const r = await hit("/login");
    assert.equal(r.status, 200);
    // Suspense-driven; static HTML may be sparse but content-type is HTML.
    assert.ok(r.headers.get("content-type")?.includes("text/html"));
  });

  test("GET /signup loads", async () => {
    const r = await hit("/signup");
    assert.equal(r.status, 200);
  });

  test("GET /invite/{bad-token} 404s", async () => {
    const r = await hit("/invite/not-a-real-token");
    assert.equal(r.status, 404, `expected 404 for bad invite, got ${r.status}`);
  });
});

// --- auth contract ----------------------------------------------------

describe("Auth", () => {
  test("POST /api/auth/signin rejects bad password", async () => {
    const r = await hit("/api/auth/signin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: DEMO_ADMIN.email, password: "wrong" }),
    });
    assert.ok([401, 400].includes(r.status), `expected 401/400, got ${r.status}`);
  });

  test("POST /api/auth/signin accepts demo admin", async () => {
    const { user } = await signIn(DEMO_ADMIN.email, DEMO_ADMIN.password);
    assert.equal(user.role, "admin");
  });

  test("POST /api/auth/signin accepts demo client", async () => {
    const { user } = await signIn(DEMO_CLIENT.email, DEMO_CLIENT.password);
    assert.equal(user.role, "client");
  });

  test("POST /api/auth/magic/request returns 200 even for unknown email (no enumeration)", async () => {
    const r = await hit("/api/auth/magic/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "definitely-not-a-real-user@example.invalid" }),
    });
    assert.equal(r.status, 200);
    const data = r.json as { ok?: boolean };
    assert.equal(data.ok, true);
  });

  test("POST /api/auth/magic/request returns 400 on missing email", async () => {
    const r = await hit("/api/auth/magic/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(r.status, 400);
  });

  test("GET /api/auth/magic/{bad-token} redirects to login with error", async () => {
    const r = await hit("/api/auth/magic/totally-bogus-token");
    assert.ok([302, 307].includes(r.status), `expected redirect, got ${r.status}`);
    const loc = r.headers.get("location") ?? "";
    assert.ok(loc.includes("/login"), `expected redirect to /login, got ${loc}`);
    assert.ok(/magic=/.test(loc), "expected ?magic= error param");
  });
});

// --- admin auth gates -------------------------------------------------

describe("Admin auth gates", () => {
  test("Anonymous POST /api/admin/clients/invite is 401", async () => {
    const r = await hit("/api/admin/clients/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "x@example.com" }),
    });
    assert.equal(r.status, 401);
  });

  test("Client POST /api/admin/clients/invite is 403", async () => {
    const { cookie } = await signIn(DEMO_CLIENT.email, DEMO_CLIENT.password);
    const r = await hit("/api/admin/clients/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "x@example.com" }),
      cookie,
    });
    assert.equal(r.status, 403);
    const data = r.json as { error?: string };
    assert.equal(data.error, "forbidden");
  });

  test("Client GET /api/admin/studios returns 401/403 or redirects", async () => {
    const { cookie } = await signIn(DEMO_CLIENT.email, DEMO_CLIENT.password);
    const r = await hit("/api/admin/studios", { cookie });
    assert.ok(
      [307, 401, 403].includes(r.status),
      `expected redirect or 403, got ${r.status}`,
    );
  });

  test("Anonymous POST /api/admin/studios is 401", async () => {
    const r = await hit("/api/admin/studios", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "test", displayName: "Test", kind: "external" }),
    });
    assert.equal(r.status, 401);
  });

  test("Client POST /api/admin/studios is 403", async () => {
    const { cookie } = await signIn(DEMO_CLIENT.email, DEMO_CLIENT.password);
    const r = await hit("/api/admin/studios", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "test", displayName: "Test", kind: "external" }),
      cookie,
    });
    assert.equal(r.status, 403);
  });
});

// --- studio routes ----------------------------------------------------

describe("Studio routes", () => {
  test("Admin GET /api/admin/studios returns studios array", async () => {
    const { cookie } = await signIn(DEMO_ADMIN.email, DEMO_ADMIN.password);
    const r = await hit("/api/admin/studios", { cookie });
    assert.equal(r.status, 200);
    const data = r.json as { studios?: unknown[] };
    assert.ok(Array.isArray(data.studios));
    assert.ok((data.studios?.length ?? 0) >= 5, "expected at least 5 seeded studios");
  });

  test("Admin PATCH /api/admin/studios/{unknown} returns 4xx", async () => {
    const { cookie } = await signIn(DEMO_ADMIN.email, DEMO_ADMIN.password);
    const r = await hit("/api/admin/studios/this-studio-does-not-exist", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "X" }),
      cookie,
    });
    assert.ok([400, 404].includes(r.status), `expected 4xx, got ${r.status}`);
  });

  test("Admin /api/admin/studios/ottawa/invites GET returns array", async () => {
    const { cookie } = await signIn(DEMO_ADMIN.email, DEMO_ADMIN.password);
    const r = await hit("/api/admin/studios/ottawa/invites", { cookie });
    assert.equal(r.status, 200);
    const data = r.json as { invites?: unknown[] };
    assert.ok(Array.isArray(data.invites));
  });
});

// --- plan gating ------------------------------------------------------

describe("Plan gating", () => {
  test("Client (unlimited demo) GET /api/youtube/me responds 200", async () => {
    const { cookie } = await signIn(DEMO_CLIENT.email, DEMO_CLIENT.password);
    const r = await hit("/api/youtube/me", { cookie });
    // 200 = either connected or not; either way it should succeed.
    assert.ok([200].includes(r.status), `got ${r.status}: ${r.text.slice(0, 200)}`);
  });

  // Note: the demo client has plan='unlimited' in mock-data, so they
  // bypass gating. We test the gate by calling with a real free-tier
  // user when /api/admin/clients/invite is used to mint one. Skipping
  // here to avoid creating side-effect rows in production DB.
});

// --- file routes ------------------------------------------------------

describe("File routes", () => {
  test("Anonymous POST /api/files/zip is 401", async () => {
    const r = await hit("/api/files/zip", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileIds: ["x"] }),
    });
    assert.equal(r.status, 401);
  });

  test("POST /api/files/zip with empty fileIds returns 400", async () => {
    const { cookie } = await signIn(DEMO_CLIENT.email, DEMO_CLIENT.password);
    const r = await hit("/api/files/zip", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileIds: [] }),
      cookie,
    });
    assert.equal(r.status, 400);
  });

  test("POST /api/files/zip rejects bogus fileId (400 or 403)", async () => {
    const { cookie } = await signIn(DEMO_CLIENT.email, DEMO_CLIENT.password);
    const r = await hit("/api/files/zip", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileIds: ["not-a-real-id"] }),
      cookie,
    });
    // decodeFileId is base64url and doesn't throw on garbage. Auth check
    // runs against the decoded blob and fails → 403. That's intentional;
    // 400 would leak whether the ID is "valid" vs "owned by someone else".
    assert.ok([400, 403].includes(r.status), `expected 400/403, got ${r.status}`);
  });
});

// --- stripe (off-by-default) ------------------------------------------

describe("Stripe routes", () => {
  test("POST /api/stripe/checkout without plan is 400", async () => {
    const { cookie } = await signIn(DEMO_CLIENT.email, DEMO_CLIENT.password);
    const r = await hit("/api/stripe/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
      cookie,
    });
    // 400 (missing plan) or 503 (stripe not configured) both acceptable.
    assert.ok([400, 503].includes(r.status), `got ${r.status}`);
  });

  test("POST /api/stripe/webhook without signature is 400 or 503", async () => {
    const r = await hit("/api/stripe/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "test" }),
    });
    assert.ok([400, 503].includes(r.status), `got ${r.status}`);
  });
});

// --- vizard / opus ----------------------------------------------------

describe("Vizard / Opus routes", () => {
  test("GET /api/vizard/templates returns templates array", async () => {
    const { cookie } = await signIn(DEMO_CLIENT.email, DEMO_CLIENT.password);
    const r = await hit("/api/vizard/templates", { cookie });
    assert.equal(r.status, 200);
    const data = r.json as { templates?: unknown[] };
    assert.ok(Array.isArray(data.templates));
    assert.ok((data.templates?.length ?? 0) >= 3, "expected ≥3 templates");
  });

  test("POST /api/vizard/start without fileId returns 400", async () => {
    const { cookie } = await signIn(DEMO_CLIENT.email, DEMO_CLIENT.password);
    const r = await hit("/api/vizard/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
      cookie,
    });
    assert.ok([400, 403, 402].includes(r.status), `got ${r.status}`);
  });
});

// --- session pages (HTML smoke) ---------------------------------------

describe("Admin pages render", () => {
  test("Admin GET /admin/clients returns 200 HTML", async () => {
    const { cookie } = await signIn(DEMO_ADMIN.email, DEMO_ADMIN.password);
    const r = await hit("/admin/clients", { cookie });
    assert.equal(r.status, 200);
    assert.ok(r.headers.get("content-type")?.includes("text/html"));
  });

  test("Admin GET /admin/studios returns 200 HTML", async () => {
    const { cookie } = await signIn(DEMO_ADMIN.email, DEMO_ADMIN.password);
    const r = await hit("/admin/studios", { cookie });
    assert.equal(r.status, 200);
  });

  test("Admin GET /admin/team returns 200 HTML", async () => {
    const { cookie } = await signIn(DEMO_ADMIN.email, DEMO_ADMIN.password);
    const r = await hit("/admin/team", { cookie });
    assert.equal(r.status, 200);
  });

  test("Admin GET /admin/integrations/vizard returns 200 HTML", async () => {
    const { cookie } = await signIn(DEMO_ADMIN.email, DEMO_ADMIN.password);
    const r = await hit("/admin/integrations/vizard", { cookie });
    assert.equal(r.status, 200);
  });
});

describe("Client pages render", () => {
  test("Client GET /account returns 200 HTML", async () => {
    const { cookie } = await signIn(DEMO_CLIENT.email, DEMO_CLIENT.password);
    const r = await hit("/account", { cookie });
    assert.equal(r.status, 200);
  });

  test("Client GET /settings/billing returns 200 HTML", async () => {
    const { cookie } = await signIn(DEMO_CLIENT.email, DEMO_CLIENT.password);
    const r = await hit("/settings/billing", { cookie });
    assert.equal(r.status, 200);
  });
});
