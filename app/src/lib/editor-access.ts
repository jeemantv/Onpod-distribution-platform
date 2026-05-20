// Server-side helpers that scope what an editor can see in the admin
// UI. Admins are unrestricted; editors are scoped to their assignment.

import { getUserByEmail } from "./auth-store";
import { STUDIO_SLUGS, sessionBelongsToEmail, type StudioSlug } from "./studio";
import type { User } from "./types";

export interface EditorScope {
  // null = unrestricted (admin)
  studios: StudioSlug[] | null;
  excludedClientEmails: Set<string>;
}

export async function loadEditorScope(user: User): Promise<EditorScope> {
  if (user.role === "admin") return { studios: null, excludedClientEmails: new Set() };
  const stored = await getUserByEmail(user.email);
  const assigned = stored?.assignedStudios;
  const excluded = stored?.excludedClientEmails ?? [];
  if (!assigned || assigned.length === 0) {
    // No assignment configured — editor sees nothing until admin assigns
    return { studios: [], excludedClientEmails: new Set(excluded.map((e) => e.toLowerCase())) };
  }
  if (assigned.includes("all")) {
    return {
      studios: [...STUDIO_SLUGS],
      excludedClientEmails: new Set(excluded.map((e) => e.toLowerCase())),
    };
  }
  return {
    studios: assigned.filter((s) =>
      (STUDIO_SLUGS as readonly string[]).includes(s),
    ) as StudioSlug[],
    excludedClientEmails: new Set(excluded.map((e) => e.toLowerCase())),
  };
}

export function studioVisibleToEditor(
  scope: EditorScope,
  slug: StudioSlug,
): boolean {
  if (scope.studios === null) return true;
  return scope.studios.includes(slug);
}

export function sessionVisibleToEditor(
  scope: EditorScope,
  slug: StudioSlug,
  sessionFolder: string,
): boolean {
  if (!studioVisibleToEditor(scope, slug)) return false;
  if (scope.excludedClientEmails.size === 0) return true;
  // If we can't tell the email, allow (e.g. raw or to-delete buckets)
  for (const excluded of scope.excludedClientEmails) {
    if (sessionBelongsToEmail(sessionFolder, excluded)) return false;
  }
  return true;
}
