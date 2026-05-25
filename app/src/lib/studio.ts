// OnPod studio + B2 path scheme constants. Used by the admin view to lay
// out studios → buckets → sessions, and by upload/download/move endpoints
// to enforce per-studio paths.
//
// New uploads use:
//   studios/{studio}/raw/{filename}                       (recorder dump)
//   studios/{studio}/unmatched/{folder}/{filename}        (no client yet)
//   studios/{studio}/to-delete/{folder}/{filename}        (soft-deleted)
//   studios/{studio}/clients/{date_time_email}/{filename} (assigned session)
//
// Session folder convention: "YYYY-MM-DD_HH-mm_email@example.com"
// Multiple clients on one recording: separate sessions, one per client,
// or rename to use a join key — out of scope for v1.

// ottawa/montreal/brossard/laval are OnPod's Pearl-fed studios (n8n
// owns folder creation). "externals" holds clients onboarded from the
// future website, manual admin invites, or non-OnPod studios — they
// self-upload (or admin uploads for them).
// Phase 3.1: dropped `as const` so STUDIO_SLUGS.includes(str) accepts any
// string (the array became a hint, not a closed enum). Dynamic studios
// live in the DB registry (lib/studio-registry.ts); these five are the
// initial seed and a legacy fallback.
export const STUDIO_SLUGS: readonly string[] = [
  "ottawa",
  "montreal",
  "brossard",
  "laval",
  "externals",
];
// StudioSlug widened to string so dynamic slugs flow through every
// signature that references this type. Runtime validation lives in
// studio-registry's isKnownStudio() — call when slug enters from input.
export type StudioSlug = string;

// Widened to string-key so dynamic studio slugs from the registry are
// passable to consumers that still read this hardcoded map. The five
// values below are the legacy fallback; new studios get their labels
// from lib/studio-registry's `studioLabels()` async getter.
export const STUDIO_LABEL: Record<string, string> = {
  ottawa: "Ottawa",
  montreal: "Montréal",
  brossard: "Brossard",
  laval: "Laval",
  externals: "Externals",
};

export const BUCKETS = [
  "clients",
  "unmatched",
  "raw",
  "to-delete",
] as const;
export type Bucket = (typeof BUCKETS)[number];

export const BUCKET_LABEL: Record<Bucket, string> = {
  clients: "Clients",
  unmatched: "Unmatched",
  raw: "Raw files",
  "to-delete": "To delete",
};

export const STUDIO_ROOT = "studios/";

// Phase 3.1: relaxed from StudioSlug to string so dynamic studios from
// the studios table flow through path helpers without ceremony. The
// original 5 slugs still work; new slugs created via the registry do
// too. Validation happens at the registry level, not in path strings.
export function studioPrefix(studio: string): string {
  return `${STUDIO_ROOT}${studio}/`;
}

export function bucketPrefix(studio: string, bucket: Bucket): string {
  return `${studioPrefix(studio)}${bucket}/`;
}

export function sessionPrefix(
  studio: string,
  sessionFolder: string,
): string {
  return `${bucketPrefix(studio, "clients")}${sessionFolder}/`;
}

// Folder name format: YYYY-MM-DD_HH-mm_email@example.com
const SESSION_FOLDER_RE =
  /^(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2})_(.+@.+)$/;

export interface ParsedSession {
  raw: string;
  date: string;
  time: string;
  email: string;
}

export function parseSessionFolder(folder: string): ParsedSession | null {
  const m = folder.match(SESSION_FOLDER_RE);
  if (!m) return null;
  return { raw: folder, date: m[1], time: m[2].replace("-", ":"), email: m[3] };
}

export function buildSessionFolder(
  date: string,
  time: string,
  email: string,
): string {
  return `${date}_${time.replace(":", "-")}_${email}`;
}

export interface ParsedKey {
  studio: StudioSlug | null;
  bucket: Bucket | null;
  sessionFolder: string | null;
  parsedSession: ParsedSession | null;
  filename: string | null;
  rest: string[];
}

export function parseKey(key: string): ParsedKey {
  if (!key.startsWith(STUDIO_ROOT)) {
    return {
      studio: null,
      bucket: null,
      sessionFolder: null,
      parsedSession: null,
      filename: null,
      rest: [],
    };
  }
  const parts = key.slice(STUDIO_ROOT.length).split("/");
  const studio = STUDIO_SLUGS.includes(parts[0] as StudioSlug)
    ? (parts[0] as StudioSlug)
    : null;
  const bucket = BUCKETS.includes(parts[1] as Bucket)
    ? (parts[1] as Bucket)
    : null;
  if (!studio || !bucket) {
    return {
      studio,
      bucket,
      sessionFolder: null,
      parsedSession: null,
      filename: null,
      rest: parts.slice(2),
    };
  }
  if (bucket === "clients") {
    const sessionFolder = parts[2] ?? null;
    const parsed = sessionFolder ? parseSessionFolder(sessionFolder) : null;
    return {
      studio,
      bucket,
      sessionFolder,
      parsedSession: parsed,
      filename: parts.slice(3).join("/") || null,
      rest: parts.slice(3),
    };
  }
  return {
    studio,
    bucket,
    sessionFolder: null,
    parsedSession: null,
    filename: parts.slice(2).join("/") || null,
    rest: parts.slice(2),
  };
}

export function sessionBelongsToEmail(
  sessionFolder: string,
  email: string,
): boolean {
  const parsed = parseSessionFolder(sessionFolder);
  if (!parsed) return false;
  return parsed.email.toLowerCase() === email.toLowerCase();
}
