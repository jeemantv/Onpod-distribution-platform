// Server-side helpers that scope what an editor can see in the admin
// UI. Admins are unrestricted; editors are scoped to:
//   - the studios listed in `assignedStudios`, AND
//   - clients whose `assignedEditorEmail` points at them — those clients'
//     sessions are visible regardless of studio assignment, and override
//     any per-editor exclusion (you can't be assigned to a client and
//     excluded from them at the same time).

import { getUserByEmail, listAllUsers } from "./auth-store";
import { STUDIO_SLUGS, sessionBelongsToEmail, type StudioSlug } from "./studio";
import { listStudios, isKnownStudio } from "./studio-registry";
import type { User } from "./types";
import { NextResponse } from "next/server";
import { getSession } from "./session";

export interface EditorScope {
  // null = unrestricted (super-admin with no assignedStudios). Empty
  // array = no studios visible (mis-configured editor). Otherwise the
  // explicit list of studio slugs.
  studios: string[] | null;
  excludedClientEmails: Set<string>;
  // Clients whose assignedEditorEmail matches this editor. Sessions for
  // these clients are always visible, even outside `studios`.
  assignedClientEmails: Set<string>;
}

/**
 * Resolve "what can this user see across studios."
 * - Admin with no assignedStudios → null (unrestricted super-admin).
 * - Admin WITH assignedStudios → restricted to those studios (Phase 3.1
 *   studio-scoped admins for external studios).
 * - Editor → same scoping rules as before, with assigned-client overrides.
 */
export async function loadEditorScope(user: User): Promise<EditorScope> {
  // Pull the dynamic studio list once; falls back to static if registry empty.
  const liveStudios = await listStudios().catch(() => []);
  const allKnown = liveStudios.length
    ? liveStudios.map((s) => s.slug)
    : ([...STUDIO_SLUGS] as string[]);

  if (user.role === "admin") {
    const stored = await getUserByEmail(user.email).catch(() => null);
    const assigned = stored?.assignedStudios ?? null;
    if (!assigned || assigned.length === 0 || assigned.includes("all")) {
      return {
        studios: null, // super-admin
        excludedClientEmails: new Set(),
        assignedClientEmails: new Set(),
      };
    }
    return {
      studios: assigned.filter((s) => allKnown.includes(s)),
      excludedClientEmails: new Set(),
      assignedClientEmails: new Set(),
    };
  }

  const [stored, allUsers] = await Promise.all([
    getUserByEmail(user.email),
    listAllUsers(),
  ]);

  const assignedClientEmails = new Set(
    allUsers
      .filter(
        (u) =>
          u.role === "client" &&
          u.assignedEditorEmail &&
          u.assignedEditorEmail.toLowerCase() === user.email.toLowerCase(),
      )
      .map((u) => u.email.toLowerCase()),
  );

  // Demo editors live in mock-data.ts, not the DB. Treat them as
  // assigned to ALL studios by default so the demo flow works.
  if (!stored) {
    return {
      studios: allKnown,
      excludedClientEmails: new Set(),
      assignedClientEmails,
    };
  }

  const assigned = stored.assignedStudios;
  const excluded = stored.excludedClientEmails ?? [];
  const excludedSet = new Set(excluded.map((e) => e.toLowerCase()));

  // If this editor has any clients assigned to them, treat every studio
  // as visible — the client could have recorded anywhere and the editor
  // is the one handling their work.
  if (assignedClientEmails.size > 0) {
    return {
      studios: allKnown,
      excludedClientEmails: excludedSet,
      assignedClientEmails,
    };
  }

  if (!assigned || assigned.length === 0) {
    return { studios: [], excludedClientEmails: excludedSet, assignedClientEmails };
  }
  if (assigned.includes("all")) {
    return { studios: allKnown, excludedClientEmails: excludedSet, assignedClientEmails };
  }
  return {
    studios: assigned.filter((s) => allKnown.includes(s)),
    excludedClientEmails: excludedSet,
    assignedClientEmails,
  };
}

export function studioVisibleToEditor(
  scope: EditorScope,
  slug: string,
): boolean {
  if (scope.studios === null) return true;
  return (scope.studios as readonly string[]).includes(slug);
}

/**
 * Single-call gate for API routes that operate on a specific studio.
 * Returns null on success (caller proceeds); returns a NextResponse
 * (401/403/400) the caller can just `return` on failure.
 *
 * Phase 3.2: replaces the old STUDIO_SLUGS.includes(slug) checks that
 * rejected dynamically-created studios, and folds in the scope check
 * that was missing from mutating admin routes.
 */
export async function assertStudioAccess(
  studio: string,
): Promise<NextResponse | null> {
  const user = getSession();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (user.role !== "admin" && user.role !== "editor") {
    return NextResponse.json(
      { error: "forbidden", message: "Admin/editor only." },
      { status: 403 },
    );
  }
  const known = await isKnownStudio(studio);
  if (!known) {
    return NextResponse.json(
      { error: "invalid_studio", message: `Unknown studio "${studio}".` },
      { status: 400 },
    );
  }
  const scope = await loadEditorScope(user as User);
  if (!studioVisibleToEditor(scope, studio)) {
    return NextResponse.json(
      { error: "forbidden", message: "Not your studio." },
      { status: 403 },
    );
  }
  return null;
}

/**
 * Gate for routes that target a specific client. Pass the client's
 * homeStudio (may be null for legacy users). Super-admins always pass.
 * Editors with assigned-client-emails also pass.
 */
export async function assertClientAccess(args: {
  clientEmail: string;
  clientHomeStudio: string | null;
}): Promise<NextResponse | null> {
  const user = getSession();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (user.role !== "admin" && user.role !== "editor") {
    return NextResponse.json(
      { error: "forbidden", message: "Admin/editor only." },
      { status: 403 },
    );
  }
  const scope = await loadEditorScope(user as User);
  if (scope.studios === null) return null; // super-admin
  if (scope.assignedClientEmails.has(args.clientEmail.toLowerCase())) return null;
  if (args.clientHomeStudio && scope.studios.includes(args.clientHomeStudio)) {
    return null;
  }
  return NextResponse.json(
    { error: "forbidden", message: "Not your client." },
    { status: 403 },
  );
}

export function sessionVisibleToEditor(
  scope: EditorScope,
  slug: string,
  sessionFolder: string,
): boolean {
  // Assigned clients win — visible even when the studio is otherwise out
  // of scope or the editor would normally exclude the email.
  for (const assigned of scope.assignedClientEmails) {
    if (sessionBelongsToEmail(sessionFolder, assigned)) return true;
  }
  if (!studioVisibleToEditor(scope, slug)) return false;
  if (scope.excludedClientEmails.size === 0) return true;
  for (const excluded of scope.excludedClientEmails) {
    if (sessionBelongsToEmail(sessionFolder, excluded)) return false;
  }
  return true;
}
