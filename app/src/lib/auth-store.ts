// Real user store backed by B2. Passwords hashed with bcrypt.

import bcrypt from "bcryptjs";
import { readState, writeState } from "./state-store";

export type StoredRole = "admin" | "editor" | "client";

export interface StoredUser {
  id: string;
  email: string;
  passwordHash: string;
  role: StoredRole;
  firstName: string;
  lastName: string;
  avatar: string;
  avatarColor: string;
  createdAt: string;
  // Optional editor that handles this client's review requests.
  // Set on clients only; ignored otherwise.
  assignedEditorEmail?: string;
}

interface ResetToken {
  token: string;
  userId: string;
  email: string;
  expiresAt: number;
  used: boolean;
}

const USERS_KEY = "users.json";
const RESET_KEY = "reset-tokens.json";
const SALT_ROUNDS = 10;

async function readUsers(): Promise<StoredUser[]> {
  return readState<StoredUser[]>(USERS_KEY, []);
}

async function writeUsers(list: StoredUser[]): Promise<void> {
  await writeState(USERS_KEY, list);
}

export async function listAllUsers(): Promise<StoredUser[]> {
  return readUsers();
}

export async function getUserByEmail(
  email: string,
): Promise<StoredUser | null> {
  const users = await readUsers();
  return (
    users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null
  );
}

export async function getUserById(id: string): Promise<StoredUser | null> {
  const users = await readUsers();
  return users.find((u) => u.id === id) ?? null;
}

interface CreateUserInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role?: StoredRole;
}

export async function createUser(input: CreateUserInput): Promise<StoredUser> {
  const existing = await getUserByEmail(input.email);
  if (existing) {
    throw new Error("An account with this email already exists.");
  }
  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  const initials =
    (input.firstName[0] ?? "?") + (input.lastName[0] ?? "?");
  const user: StoredUser = {
    id: `u_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    email: input.email.toLowerCase(),
    passwordHash,
    role: input.role ?? "client",
    firstName: input.firstName,
    lastName: input.lastName,
    avatar: initials.toUpperCase(),
    avatarColor: randomAvatarColor(),
    createdAt: new Date().toISOString(),
  };
  const users = await readUsers();
  users.push(user);
  await writeUsers(users);
  return user;
}

export async function updateUserPassword(
  userId: string,
  newPassword: string,
): Promise<void> {
  const users = await readUsers();
  const i = users.findIndex((u) => u.id === userId);
  if (i < 0) throw new Error("user not found");
  users[i].passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await writeUsers(users);
}

export async function updateUserRole(
  userId: string,
  role: StoredRole,
): Promise<void> {
  const users = await readUsers();
  const i = users.findIndex((u) => u.id === userId);
  if (i < 0) throw new Error("user not found");
  users[i].role = role;
  await writeUsers(users);
}

export async function updateUserAssignedEditor(
  userId: string,
  assignedEditorEmail: string | null,
): Promise<void> {
  const users = await readUsers();
  const i = users.findIndex((u) => u.id === userId);
  if (i < 0) throw new Error("user not found");
  users[i].assignedEditorEmail = assignedEditorEmail || undefined;
  await writeUsers(users);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// ---------- Password reset tokens ----------

async function readResetTokens(): Promise<ResetToken[]> {
  return readState<ResetToken[]>(RESET_KEY, []);
}

async function writeResetTokens(list: ResetToken[]): Promise<void> {
  await writeState(RESET_KEY, list);
}

export async function createResetToken(userId: string, email: string): Promise<string> {
  const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  const list = await readResetTokens();
  // Clean up old expired tokens for this user
  const cleaned = list.filter(
    (t) => t.userId !== userId || (t.expiresAt > Date.now() && !t.used),
  );
  cleaned.push({
    token,
    userId,
    email,
    expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour
    used: false,
  });
  await writeResetTokens(cleaned);
  return token;
}

export async function consumeResetToken(
  token: string,
): Promise<ResetToken | null> {
  const list = await readResetTokens();
  const i = list.findIndex((t) => t.token === token);
  if (i < 0) return null;
  const t = list[i];
  if (t.used || t.expiresAt < Date.now()) return null;
  list[i] = { ...t, used: true };
  await writeResetTokens(list);
  return t;
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
