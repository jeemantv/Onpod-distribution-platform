import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getUserByEmail, getUserById } from "./mock-data";
import type { User } from "./types";

const COOKIE_NAME = "onpod_session";

export function getSession(): User | null {
  const c = cookies().get(COOKIE_NAME);
  if (!c?.value) return null;
  return getUserById(c.value) ?? null;
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

export function requireClient(): User {
  const u = requireSession();
  if (u.role !== "client" && u.role !== "admin") redirect("/login");
  return u;
}

export function signIn(email: string): User {
  const existing = getUserByEmail(email);
  const user =
    existing ?? getUserByEmail("marc@example.com")!;
  cookies().set(COOKIE_NAME, user.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return user;
}

export function signOut(): void {
  cookies().delete(COOKIE_NAME);
}

export const SESSION_COOKIE = COOKIE_NAME;
