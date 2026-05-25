// DB-backed studio registry. lib/studio.ts holds the legacy static
// STUDIO_SLUGS / STUDIO_LABEL — kept for backwards compatibility, but
// new code should read from here so admins can spin up new workspaces
// without redeploys.
//
// `kind` is a UX tag — "onpod" = Pearl-fed (n8n owns folder creation),
// "external" = self-upload workspace owned by an external studio or
// the catch-all "externals" workspace.

import "server-only";
import { randomBytes } from "crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "./db";
import { studios, studioInvites, type StudioRow, type StudioInviteRow } from "./db/schema";

export type StudioKind = "onpod" | "external";

export interface StudioRegistryEntry {
  slug: string;
  displayName: string;
  kind: StudioKind;
  paymentLinkUrl: string | null;
  createdAt: Date;
}

function toEntry(r: StudioRow): StudioRegistryEntry {
  return {
    slug: r.slug,
    displayName: r.displayName,
    kind: (r.kind === "onpod" ? "onpod" : "external"),
    paymentLinkUrl: r.paymentLinkUrl ?? null,
    createdAt: r.createdAt,
  };
}

export async function setStudioPaymentLink(
  slug: string,
  url: string | null,
): Promise<void> {
  const v = url?.trim() || null;
  if (v && !/^https?:\/\//i.test(v)) {
    throw new Error("paymentLinkUrl must be an http(s) URL");
  }
  const result = await db
    .update(studios)
    .set({ paymentLinkUrl: v })
    .where(eq(studios.slug, slug))
    .returning({ id: studios.id });
  if (result.length === 0) throw new Error("studio not found");
}

// ---------- Studio invites ----------

export interface StudioInviteEntry {
  id: string;
  studioSlug: string;
  token: string;
  label: string | null;
  createdAt: Date;
  usedCount: number;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

function toInviteEntry(r: StudioInviteRow): StudioInviteEntry {
  return {
    id: r.id,
    studioSlug: r.studioSlug,
    token: r.token,
    label: r.label,
    createdAt: r.createdAt,
    usedCount: r.usedCount,
    lastUsedAt: r.lastUsedAt,
    revokedAt: r.revokedAt,
  };
}

export async function createStudioInvite(args: {
  studioSlug: string;
  label?: string;
  createdBy?: string;
}): Promise<StudioInviteEntry> {
  const studio = await getStudio(args.studioSlug);
  if (!studio) throw new Error("studio not found");
  // 24 bytes -> 32 base64url chars. Roomy enough that brute-forcing is
  // not a concern, short enough for embedding in a URL.
  const token = randomBytes(24).toString("base64url");
  const [row] = await db
    .insert(studioInvites)
    .values({
      studioSlug: args.studioSlug,
      token,
      label: args.label?.trim() || null,
      createdBy: args.createdBy ?? null,
    })
    .returning();
  return toInviteEntry(row);
}

export async function listStudioInvites(studioSlug: string): Promise<StudioInviteEntry[]> {
  const rows = await db
    .select()
    .from(studioInvites)
    .where(eq(studioInvites.studioSlug, studioSlug))
    .orderBy(desc(studioInvites.createdAt));
  return rows.map(toInviteEntry);
}

export async function getStudioInviteByToken(token: string): Promise<StudioInviteEntry | null> {
  const [row] = await db
    .select()
    .from(studioInvites)
    .where(and(eq(studioInvites.token, token), isNull(studioInvites.revokedAt)))
    .limit(1);
  return row ? toInviteEntry(row) : null;
}

export async function revokeStudioInvite(inviteId: string): Promise<void> {
  await db
    .update(studioInvites)
    .set({ revokedAt: new Date() })
    .where(eq(studioInvites.id, inviteId));
}

export async function recordStudioInviteUse(inviteId: string): Promise<void> {
  // Two-step: read then write. Plenty fast at our scale and avoids
  // sql.raw incantations.
  const [row] = await db
    .select()
    .from(studioInvites)
    .where(eq(studioInvites.id, inviteId))
    .limit(1);
  if (!row) return;
  await db
    .update(studioInvites)
    .set({ usedCount: row.usedCount + 1, lastUsedAt: new Date() })
    .where(eq(studioInvites.id, inviteId));
}

/** All studios, ordered by created_at ascending. */
export async function listStudios(): Promise<StudioRegistryEntry[]> {
  const rows = await db.select().from(studios).orderBy(studios.createdAt);
  return rows.map(toEntry);
}

export async function getStudio(slug: string): Promise<StudioRegistryEntry | null> {
  const [row] = await db.select().from(studios).where(eq(studios.slug, slug)).limit(1);
  return row ? toEntry(row) : null;
}

export async function createStudio(input: {
  slug: string;
  displayName: string;
  kind: StudioKind;
}): Promise<StudioRegistryEntry> {
  const slug = input.slug.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new Error("Slug must be lowercase letters/digits/hyphens.");
  }
  if (!input.displayName.trim()) {
    throw new Error("Display name is required.");
  }
  const [row] = await db
    .insert(studios)
    .values({
      slug,
      displayName: input.displayName.trim(),
      kind: input.kind,
    })
    .returning();
  return toEntry(row);
}

export async function renameStudio(slug: string, displayName: string): Promise<void> {
  if (!displayName.trim()) throw new Error("Display name is required.");
  const result = await db
    .update(studios)
    .set({ displayName: displayName.trim() })
    .where(eq(studios.slug, slug))
    .returning({ id: studios.id });
  if (result.length === 0) throw new Error("studio not found");
}

export async function setStudioKind(slug: string, kind: StudioKind): Promise<void> {
  const result = await db
    .update(studios)
    .set({ kind })
    .where(eq(studios.slug, slug))
    .returning({ id: studios.id });
  if (result.length === 0) throw new Error("studio not found");
}

/** Slug + label map for UI dropdowns. */
export async function studioLabels(): Promise<Record<string, string>> {
  const rows = await listStudios();
  return Object.fromEntries(rows.map((s) => [s.slug, s.displayName]));
}

/** Async validation — true if the slug exists in the registry. */
export async function isKnownStudio(slug: string): Promise<boolean> {
  const row = await getStudio(slug);
  return !!row;
}
