// Centralized key-level access check for B2 objects.
//
// Legacy keys:  {userId}/{projectId}/{filename}  → owner == user
// Studio keys:  studios/{studio}/{bucket}/...    → admin/editor or
//               (bucket=="clients" and folder email matches user.email)

import type { User } from "./types";
import { parseKey, sessionBelongsToEmail, STUDIO_ROOT } from "./studio";

export function canAccessKey(user: User, key: string): boolean {
  // Guest editor: their role is "editor" so canMarkDone gates open, but
  // they should only see the host client's files — not the studio tree.
  // Same access surface as the host client would have.
  if (user.guest) {
    if (key.startsWith(STUDIO_ROOT)) {
      const parsed = parseKey(key);
      if (parsed.bucket !== "clients" || !parsed.sessionFolder) return false;
      return sessionBelongsToEmail(parsed.sessionFolder, user.email);
    }
    const ownerId = key.split("/", 1)[0];
    return ownerId === user.id;
  }
  if (key.startsWith(STUDIO_ROOT)) {
    if (user.role === "admin" || user.role === "editor") return true;
    const parsed = parseKey(key);
    if (parsed.bucket !== "clients" || !parsed.sessionFolder) return false;
    return sessionBelongsToEmail(parsed.sessionFolder, user.email);
  }
  if (user.role === "admin") return true;
  const ownerId = key.split("/", 1)[0];
  return ownerId === user.id;
}
