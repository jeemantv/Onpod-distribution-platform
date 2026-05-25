// Postgres-backed user store. Passwords hashed with bcrypt — Auth.js
// migration replaces this in Phase 2.

import bcrypt from "bcryptjs";
import { and, asc, eq, lt, or } from "drizzle-orm";
import { db } from "./db";
import { resetTokens, users, type ResetTokenRow, type User } from "./db/schema";
import type { Plan } from "./types";

export type StoredRole = "admin" | "editor" | "client";

// Public shape exposed to callers. Mirrors the legacy interface (string
// timestamps, `undefined` not `null` for optionals) so API routes and
// admin pages don't need to change when storage flipped from B2 to PG.
export interface StoredUser {
  id: string;
  email: string;
  passwordHash: string;
  role: StoredRole;
  // DB column is plain text — any string is allowed at storage. We narrow
  // to Plan here so SessionPayload + UI can lean on the union.
  plan: Plan;
  firstName: string;
  lastName: string;
  avatar: string;
  avatarColor: string;
  createdAt: string;
  assignedEditorEmail?: string;
  assignedStudios?: string[];
  excludedClientEmails?: string[];
  // Client-only — undefined for admin/editor and pre-Phase-2 clients.
  homeStudio?: string;
  selfUploadEnabled?: boolean;
}

const SALT_ROUNDS = 10;

function toStored(u: User): StoredUser {
  return {
    id: u.id,
    email: u.email,
    passwordHash: u.passwordHash ?? "",
    role: u.role,
    plan: (u.plan ?? "free") as Plan,
    firstName: u.firstName,
    lastName: u.lastName,
    avatar: u.avatar,
    avatarColor: u.avatarColor,
    createdAt: u.createdAt.toISOString(),
    assignedEditorEmail: u.assignedEditorEmail ?? undefined,
    assignedStudios: u.assignedStudios ?? undefined,
    excludedClientEmails: u.excludedClientEmails ?? undefined,
    homeStudio: u.homeStudio ?? undefined,
    selfUploadEnabled: u.selfUploadEnabled,
  };
}

// ---------- Reads ----------

export async function listAllUsers(): Promise<StoredUser[]> {
  const rows = await db
    .select()
    .from(users)
    .orderBy(asc(users.createdAt));
  return rows.map(toStored);
}

export async function getUserByEmail(email: string): Promise<StoredUser | null> {
  const lowered = email.trim().toLowerCase();
  const [row] = await db.select().from(users).where(eq(users.email, lowered)).limit(1);
  return row ? toStored(row) : null;
}

export async function getUserById(id: string): Promise<StoredUser | null> {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row ? toStored(row) : null;
}

// ---------- Writes ----------

interface CreateUserInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role?: StoredRole;
}

export async function createUser(input: CreateUserInput): Promise<StoredUser> {
  const email = input.email.trim().toLowerCase();
  const existing = await getUserByEmail(email);
  if (existing) {
    throw new Error("An account with this email already exists.");
  }
  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const initials = ((input.firstName[0] ?? "?") + (input.lastName[0] ?? "?")).toUpperCase();
  const [row] = await db
    .insert(users)
    .values({
      email,
      passwordHash,
      role: input.role ?? "client",
      firstName: input.firstName,
      lastName: input.lastName,
      avatar: initials,
      avatarColor: randomAvatarColor(),
    })
    .returning();
  return toStored(row);
}

export async function updateUserPassword(userId: string, newPassword: string): Promise<void> {
  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  const result = await db
    .update(users)
    .set({ passwordHash })
    .where(eq(users.id, userId))
    .returning({ id: users.id });
  if (result.length === 0) throw new Error("user not found");
}

export async function updateUserRole(userId: string, role: StoredRole): Promise<void> {
  const result = await db
    .update(users)
    .set({ role })
    .where(eq(users.id, userId))
    .returning({ id: users.id });
  if (result.length === 0) throw new Error("user not found");
}

// Sets the Stripe linkage columns. Called from the checkout route after
// we create a Customer, and from the webhook after subscription events.
export async function updateUserStripe(
  userId: string,
  patch: { stripeCustomerId?: string | null; stripeSubscriptionId?: string | null },
): Promise<void> {
  const set: { stripeCustomerId?: string | null; stripeSubscriptionId?: string | null } = {};
  if (patch.stripeCustomerId !== undefined) set.stripeCustomerId = patch.stripeCustomerId;
  if (patch.stripeSubscriptionId !== undefined) set.stripeSubscriptionId = patch.stripeSubscriptionId;
  if (Object.keys(set).length === 0) return;
  const result = await db
    .update(users)
    .set(set)
    .where(eq(users.id, userId))
    .returning({ id: users.id });
  if (result.length === 0) throw new Error("user not found");
}

export async function getUserByStripeCustomerId(customerId: string): Promise<StoredUser | null> {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.stripeCustomerId, customerId))
    .limit(1);
  return row ? toStored(row) : null;
}

export async function updateUserPlan(userId: string, plan: string): Promise<void> {
  const result = await db
    .update(users)
    .set({ plan })
    .where(eq(users.id, userId))
    .returning({ id: users.id });
  if (result.length === 0) throw new Error("user not found");
}

export async function updateUserHomeStudio(
  userId: string,
  homeStudio: string | null,
): Promise<void> {
  const result = await db
    .update(users)
    .set({ homeStudio })
    .where(eq(users.id, userId))
    .returning({ id: users.id });
  if (result.length === 0) throw new Error("user not found");
}

export async function updateUserSelfUpload(
  userId: string,
  enabled: boolean,
): Promise<void> {
  const result = await db
    .update(users)
    .set({ selfUploadEnabled: enabled })
    .where(eq(users.id, userId))
    .returning({ id: users.id });
  if (result.length === 0) throw new Error("user not found");
}

export async function deleteUser(userId: string): Promise<boolean> {
  const result = await db.delete(users).where(eq(users.id, userId)).returning({ id: users.id });
  return result.length > 0;
}

export async function updateUserAssignedEditor(
  userId: string,
  assignedEditorEmail: string | null,
): Promise<void> {
  const value = assignedEditorEmail ? assignedEditorEmail.toLowerCase() : null;
  const result = await db
    .update(users)
    .set({ assignedEditorEmail: value })
    .where(eq(users.id, userId))
    .returning({ id: users.id });
  if (result.length === 0) throw new Error("user not found");
}

export async function updateEditorAssignment(
  userId: string,
  assignment: { assignedStudios?: string[]; excludedClientEmails?: string[] },
): Promise<void> {
  const patch: { assignedStudios?: string[] | null; excludedClientEmails?: string[] | null } = {};
  if (assignment.assignedStudios !== undefined) {
    patch.assignedStudios = assignment.assignedStudios.length ? assignment.assignedStudios : null;
  }
  if (assignment.excludedClientEmails !== undefined) {
    patch.excludedClientEmails = assignment.excludedClientEmails.length
      ? assignment.excludedClientEmails.map((e) => e.toLowerCase())
      : null;
  }
  const result = await db
    .update(users)
    .set(patch)
    .where(eq(users.id, userId))
    .returning({ id: users.id });
  if (result.length === 0) throw new Error("user not found");
}

export async function assignEditorToAllClients(editorEmail: string): Promise<number> {
  const lowered = editorEmail.toLowerCase();
  const result = await db
    .update(users)
    .set({ assignedEditorEmail: lowered })
    .where(eq(users.role, "client"))
    .returning({ id: users.id });
  return result.length;
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

// ---------- Password reset tokens ----------

export async function createResetToken(userId: string, email: string): Promise<string> {
  const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  // Clean up tokens that are either expired or already used for this user
  // before issuing a new one.
  await db
    .delete(resetTokens)
    .where(
      and(
        eq(resetTokens.userId, userId),
        or(eq(resetTokens.used, true), lt(resetTokens.expiresAt, new Date())),
      ),
    );
  await db.insert(resetTokens).values({
    token,
    userId,
    email: email.toLowerCase(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  return token;
}

export async function consumeResetToken(token: string): Promise<{
  token: string;
  userId: string;
  email: string;
  expiresAt: number;
  used: boolean;
} | null> {
  const [row] = await db
    .select()
    .from(resetTokens)
    .where(eq(resetTokens.token, token))
    .limit(1);
  if (!row) return null;
  if (row.used || row.expiresAt.getTime() < Date.now()) return null;
  await db.update(resetTokens).set({ used: true }).where(eq(resetTokens.token, token));
  return rowToToken(row);
}

function rowToToken(row: ResetTokenRow) {
  return {
    token: row.token,
    userId: row.userId,
    email: row.email,
    expiresAt: row.expiresAt.getTime(),
    used: true,
  };
}

function randomAvatarColor(): string {
  const palettes = [
    "linear-gradient(135deg,#ff3b30,#ff8a00)",
    "linear-gradient(135deg,#14b8a6,#60a5fa)",
    "linear-gradient(135deg,#a855f7,#ec4899)",
    "linear-gradient(135deg,#f59e0b,#ef4444)",
    "linear-gradient(135deg,#10b981,#3b82f6)",
    "linear-gradient(135deg,#8b5cf6,#06b6d4)",
  ];
  return palettes[Math.floor(Math.random() * palettes.length)];
}
