// Client-safe builder for the same public URL shape that src/lib/b2.ts
// emits server-side. Lets client components compute a B2 URL without
// pulling the full AWS SDK into the bundle.

const PUBLIC_URL_CACHE_BUST = "v3";

export function publicUrl(key: string): string {
  const base =
    process.env.NEXT_PUBLIC_B2_DOWNLOAD_URL ?? "https://f006.backblazeb2.com";
  const bucket = process.env.NEXT_PUBLIC_B2_BUCKET ?? "TESTEPIPHAN";
  const path = key.split("/").map(encodeURIComponent).join("/");
  return `${base}/file/${encodeURIComponent(bucket)}/${path}?cb=${PUBLIC_URL_CACHE_BUST}`;
}
