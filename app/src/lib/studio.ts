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

export const STUDIO_SLUGS = ["ottawa", "montreal", "brossard", "laval"] as const;
export type StudioSlug = (typeof STUDIO_SLUGS)[number];

export const STUDIO_LABEL: Record<StudioSlug, string> = {
  ottawa: "Ottawa",
  montreal: "Montréal",
  brossard: "Brossard",
  laval: "Laval",
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

export function studioPrefix(studio: StudioSlug): string {
  return `${STUDIO_ROOT}${studio}/`;
}

export function bucketPrefix(studio: StudioSlug, bucket: Bucket): string {
  return `${studioPrefix(studio)}${bucket}/`;
}

export function sessionPrefix(
  studio: StudioSlug,
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
