// Magic-link token helpers. Uses the verification_tokens table (Auth.js
// adapter shape) so we can swap to real Auth.js later without losing
// pending invites. Tokens are single-use, 32-byte URL-safe random,
// 30-minute expiry. Identifier = the user's lowercased email.

import { randomBytes } from "crypto";
import { and, eq, lt } from "drizzle-orm";
import { db } from "./db";
import { verificationTokens } from "./db/schema";

const TOKEN_TTL_MS = 30 * 60 * 1000;

export function newMagicToken(): string {
  // URL-safe base64. 32 bytes = 256 bits of entropy.
  return randomBytes(32).toString("base64url");
}

/** Create + persist a magic-link token for the given email. */
export async function issueMagicToken(email: string): Promise<{ token: string; expiresAt: Date }> {
  const lowered = email.trim().toLowerCase();
  const token = newMagicToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  // Garbage-collect any stale tokens for this email before issuing a new one.
  await db
    .delete(verificationTokens)
    .where(
      and(
        eq(verificationTokens.identifier, lowered),
        lt(verificationTokens.expires, new Date()),
      ),
    );

  await db.insert(verificationTokens).values({
    identifier: lowered,
    token,
    expires: expiresAt,
  });
  return { token, expiresAt };
}

/**
 * Consume a token: validates + deletes in one step. Returns the email it
 * was issued for, or null if invalid/expired.
 */
export async function consumeMagicToken(token: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(verificationTokens)
    .where(eq(verificationTokens.token, token))
    .limit(1);
  if (!row) return null;
  if (row.expires.getTime() < Date.now()) {
    // Stale — clean up + reject.
    await db
      .delete(verificationTokens)
      .where(eq(verificationTokens.token, token));
    return null;
  }
  await db.delete(verificationTokens).where(eq(verificationTokens.token, token));
  return row.identifier;
}

/** Build the absolute magic-link URL given an origin + token. */
export function buildMagicLinkUrl(origin: string, token: string): string {
  return `${origin}/api/auth/magic/${encodeURIComponent(token)}`;
}
