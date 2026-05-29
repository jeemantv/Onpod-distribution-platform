// Multi-delegate guest access for a client. Each delegate gets their
// own permanent sign-in URL. Same redemption mechanics as the dedicated
// external_editor slot — the URL signs them in as a guest session
// scoped to the host client's files only.

import { randomBytes } from "crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "./db";
import { accountDelegates, type AccountDelegateRow } from "./db/schema";

export interface AccountDelegate {
  id: string;
  email: string;
  name: string;
  label: string | null;
  token: string;
  createdAt: Date;
}

export interface DelegateRedemption {
  clientId: string;
  clientEmail: string;
  clientFirstName: string;
  clientLastName: string;
  clientHomeStudio: string | null;
  guestEmail: string;
  guestName: string;
}

function toView(r: AccountDelegateRow): AccountDelegate {
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    label: r.label,
    token: r.token,
    createdAt: r.createdAt,
  };
}

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function listDelegates(
  ownerUserId: string,
): Promise<AccountDelegate[]> {
  const rows = await db
    .select()
    .from(accountDelegates)
    .where(
      and(
        eq(accountDelegates.ownerUserId, ownerUserId),
        isNull(accountDelegates.revokedAt),
      ),
    )
    .orderBy(asc(accountDelegates.createdAt));
  return rows.map(toView);
}

export async function createDelegate(
  ownerUserId: string,
  input: { email: string; name: string; label?: string },
): Promise<AccountDelegate> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!email || !email.includes("@")) throw new Error("invalid_email");
  if (!name) throw new Error("name_required");
  const [row] = await db
    .insert(accountDelegates)
    .values({
      ownerUserId,
      email,
      name,
      label: input.label?.trim() || null,
      token: newToken(),
    })
    .returning();
  return toView(row);
}

export async function revokeDelegate(
  ownerUserId: string,
  delegateId: string,
): Promise<boolean> {
  const result = await db
    .update(accountDelegates)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(accountDelegates.id, delegateId),
        eq(accountDelegates.ownerUserId, ownerUserId),
      ),
    )
    .returning({ id: accountDelegates.id });
  return result.length > 0;
}

/**
 * Look up the client a delegate token grants access to. Mirrors the
 * external_editor lookup shape so /guest/<token> can try both stores
 * with the same redemption call.
 */
export async function findClientByDelegateToken(
  token: string,
): Promise<DelegateRedemption | null> {
  if (!token) return null;
  const { users } = await import("./db/schema");
  const [row] = await db
    .select({
      delegateEmail: accountDelegates.email,
      delegateName: accountDelegates.name,
      revokedAt: accountDelegates.revokedAt,
      clientId: users.id,
      clientEmail: users.email,
      clientFirstName: users.firstName,
      clientLastName: users.lastName,
      clientHomeStudio: users.homeStudio,
    })
    .from(accountDelegates)
    .innerJoin(users, eq(accountDelegates.ownerUserId, users.id))
    .where(eq(accountDelegates.token, token))
    .limit(1);
  if (!row || row.revokedAt) return null;
  return {
    clientId: row.clientId,
    clientEmail: row.clientEmail,
    clientFirstName: row.clientFirstName,
    clientLastName: row.clientLastName,
    clientHomeStudio: row.clientHomeStudio,
    guestEmail: row.delegateEmail,
    guestName: row.delegateName,
  };
}
