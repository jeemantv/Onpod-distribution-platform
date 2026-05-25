// Session cookie: signed payload that embeds the user's identity so
// every getSession() call is a fast synchronous decode (no B2 lookup).
//
// Format:  base64url(JSON.stringify(payload)) . base64url(hmac)
// HMAC:    sha256 over the encoded payload, keyed with NEXTAUTH_SECRET.
//
// Mock users (mock-data.ts) still work — they get signed sessions just
// like real B2 users.

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getUserById as getMockUserById } from "./mock-data";
import type { Role, User } from "./types";

const COOKIE_NAME = "onpod_session";
const SECRET = process.env.NEXTAUTH_SECRET || "onpod-dev-secret-rotate-me";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

interface SessionPayload {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar: string;
  avatarColor: string;
  role: Role;
  plan: User["plan"];
  exp: number;
}

function b64urlEncode(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

function b64urlDecode(s: string): string {
  return Buffer.from(s, "base64url").toString("utf8");
}

function hmac(data: string): string {
  return crypto.createHmac("sha256", SECRET).update(data).digest("base64url");
}

function timingSafeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function sign(payload: SessionPayload): string {
  const body = b64urlEncode(JSON.stringify(payload));
  return `${body}.${hmac(body)}`;
}

function verify(token: string): SessionPayload | null {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!timingSafeEqual(sig, hmac(body))) return null;
  try {
    const parsed = JSON.parse(b64urlDecode(body)) as SessionPayload;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function payloadToUser(p: SessionPayload): User {
  return {
    id: p.uid,
    email: p.email,
    firstName: p.firstName,
    lastName: p.lastName,
    avatar: p.avatar,
    avatarColor: p.avatarColor,
    role: p.role,
    plan: p.plan,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    creditsResetAt: "",
    createdAt: "",
  };
}

export function getSession(): User | null {
  const c = cookies().get(COOKIE_NAME);
  if (!c?.value) return null;
  const payload = verify(c.value);
  if (!payload) return null;
  return payloadToUser(payload);
}

export function requireSession(): User {
  const u = getSession();
  if (!u) redirect("/login");
  return u;
}

export function requireAdmin(): User {
  const u = requireSession();
  if (u.role !== "admin") redirect("/account");
  return u;
}

export function requireEditorOrAdmin(): User {
  const u = requireSession();
  if (u.role !== "admin" && (u.role as string) !== "editor") redirect("/account");
  return u;
}

export function requireClient(): User {
  const u = requireSession();
  if (!["admin", "editor", "client"].includes(u.role as string)) {
    redirect("/login");
  }
  return u;
}

interface SignInUserShape {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar: string;
  avatarColor: string;
  role: Role;
  plan?: User["plan"];
}

export function setSession(user: SignInUserShape): void {
  const payload: SessionPayload = {
    uid: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    avatar: user.avatar,
    avatarColor: user.avatarColor,
    role: user.role,
    plan: user.plan ?? "free",
    exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS,
  };
  cookies().set(COOKIE_NAME, sign(payload), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
}

export function signOut(): void {
  cookies().delete(COOKIE_NAME);
}

/**
 * Legacy demo login (no password) — falls back to mock-data accounts so
 * the demo accounts (admin@onpod.io, marc@example.com, etc.) still work.
 * Real B2-backed users go through /api/auth/login with a password.
 */
export function signInDemo(email: string): User | null {
  const mock = findMockByEmail(email);
  if (!mock) return null;
  setSession(mock);
  return mock;
}

function findMockByEmail(email: string): User | null {
  // Avoid pulling mock-data at module load — keep it lazy
  const { mockUsers } = require("./mock-data") as typeof import("./mock-data");
  return (
    mockUsers.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null
  );
}

// Lazy mock id lookup, used by API routes that look up by id (kept for
// backwards compatibility but no longer the primary path).
export function getMockUserByIdProxy(id: string): User | null {
  return getMockUserById(id) ?? null;
}

export const SESSION_COOKIE = COOKIE_NAME;
