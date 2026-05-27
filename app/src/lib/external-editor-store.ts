// External (guest) editor for a client. The client tells OnPod who their
// freelance editor is — by email + name — and OnPod issues a permanent
// token. When the editor clicks /guest/<token>, they get a guest session
// scoped to that client only: they see what the client sees, plus
// editor-flavored capabilities (upload new versions, mark revision
// notes done, etc.). Access lasts until the client clicks Revoke.

import { randomBytes } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "./db";
import { users } from "./db/schema";

export interface ExternalEditor {
  email: string;
  name: string;
  token: string;
}

export interface GuestRedemption {
  clientId: string;
  clientEmail: string;
  clientFirstName: string;
  clientLastName: string;
  clientHomeStudio: string | null;
  guestEmail: string;
  guestName: string;
}

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function setExternalEditor(
  userId: string,
  input: { email: string; name: string },
): Promise<ExternalEditor> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!email || !email.includes("@")) throw new Error("invalid_email");
  if (!name) throw new Error("name_required");

  // Reuse an existing token when the client just updates the email/name
  // — otherwise the editor's link would silently break every edit.
  const [existing] = await db
    .select({ token: users.externalEditorToken })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const token = existing?.token ?? newToken();

  await db
    .update(users)
    .set({
      externalEditorEmail: email,
      externalEditorName: name,
      externalEditorToken: token,
      externalEditorRevokedAt: null,
    })
    .where(eq(users.id, userId));
  return { email, name, token };
}

export async function getExternalEditor(
  userId: string,
): Promise<ExternalEditor | null> {
  const [row] = await db
    .select({
      email: users.externalEditorEmail,
      name: users.externalEditorName,
      token: users.externalEditorToken,
      revokedAt: users.externalEditorRevokedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row?.email || !row?.token || row.revokedAt) return null;
  return {
    email: row.email,
    name: row.name ?? row.email,
    token: row.token,
  };
}

export async function revokeExternalEditor(userId: string): Promise<void> {
  await db
    .update(users)
    .set({ externalEditorRevokedAt: new Date() })
    .where(eq(users.id, userId));
}

/**
 * Look up a guest by their redemption token. Returns the client they're
 * granted access to + the guest's stored identity. Returns null if the
 * token is unknown, the editor was cleared, or access was revoked.
 */
export async function findClientByGuestToken(
  token: string,
): Promise<GuestRedemption | null> {
  if (!token) return null;
  const [row] = await db
    .select({
      clientId: users.id,
      clientEmail: users.email,
      clientFirstName: users.firstName,
      clientLastName: users.lastName,
      clientHomeStudio: users.homeStudio,
      guestEmail: users.externalEditorEmail,
      guestName: users.externalEditorName,
    })
    .from(users)
    .where(
      and(
        eq(users.externalEditorToken, token),
        isNull(users.externalEditorRevokedAt),
      ),
    )
    .limit(1);
  if (!row || !row.guestEmail) return null;
  return {
    clientId: row.clientId,
    clientEmail: row.clientEmail,
    clientFirstName: row.clientFirstName,
    clientLastName: row.clientLastName,
    clientHomeStudio: row.clientHomeStudio,
    guestEmail: row.guestEmail,
    guestName: row.guestName ?? row.guestEmail,
  };
}
