// YouTube OAuth + Data API v3 helpers.
// Spec §7. Uses fetch directly — no SDK dependency.

// Keep this list MINIMAL. Google rejects the whole consent request with
// "scopes that cannot be requested together" if force-ssl is bundled with the
// wrong companions, so ask for exactly two:
//   - youtube.upload   : publishing videos
//   - youtube.force-ssl: full account read/write, and the ONLY scope that
//     captions.download accepts — which is what lets AI YouTube read the
//     transcript of an UNLISTED or PRIVATE video on a channel you own.
// force-ssl is a superset of the old `youtube` and `youtube.readonly` scopes,
// so channels.list, playlists and videos.insert all still work.
export const YT_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.force-ssl",
];

export const CAPTIONS_SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl";

/** Connections made before force-ssl was requested need a reconnect. */
export function hasCaptionsScope(scope: string | undefined): boolean {
  return (scope ?? "").split(/\s+/).includes(CAPTIONS_SCOPE);
}

export function isConfigured(): boolean {
  return !!(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET);
}

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.YOUTUBE_CLIENT_ID ?? "",
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: YT_SCOPES.join(" "),
    access_type: "offline",
    // select_account + consent so the user can pick a DIFFERENT account/brand
    // channel each time (needed to connect more than one channel).
    prompt: "select_account consent",
    // Deliberately NOT include_granted_scopes. It silently merges every scope
    // the Google account ever granted this client (drive.file, for one) into
    // the request, and Google then refuses the combination outright with
    // "This request contains scopes that cannot be requested together".
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function getRedirectUri(): string {
  return (
    process.env.YOUTUBE_REDIRECT_URI ??
    `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/api/youtube/callback`
  );
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
  tokenType: string;
}

export async function exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.YOUTUBE_CLIENT_ID ?? "",
      client_secret: process.env.YOUTUBE_CLIENT_SECRET ?? "",
      redirect_uri: getRedirectUri(),
      grant_type: "authorization_code",
    }).toString(),
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
    token_type: string;
  };
  if (!data.refresh_token) {
    throw new Error(
      "Google did not return a refresh_token. Make sure prompt=consent and access_type=offline are set, and revoke previous access at https://myaccount.google.com/permissions before retrying.",
    );
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    scope: data.scope,
    tokenType: data.token_type,
  };
}

export async function refreshTokens(refreshToken: string): Promise<OAuthTokens> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.YOUTUBE_CLIENT_ID ?? "",
      client_secret: process.env.YOUTUBE_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
    }).toString(),
  });
  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
    scope: string;
    token_type: string;
  };
  return {
    accessToken: data.access_token,
    refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
    scope: data.scope,
    tokenType: data.token_type,
  };
}

export interface YouTubeChannelInfo {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  subscriberCount: string | null;
}

export async function listMyChannels(
  accessToken: string,
): Promise<YouTubeChannelInfo[]> {
  const params = new URLSearchParams({
    part: "snippet,statistics",
    mine: "true",
    maxResults: "50",
  });
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    throw new Error(`channels.list failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    items?: Array<{
      id: string;
      snippet: { title: string; thumbnails?: { default?: { url?: string } } };
      statistics?: { subscriberCount?: string };
    }>;
  };
  return (data.items ?? []).map((it) => ({
    id: it.id,
    title: it.snippet.title,
    thumbnailUrl: it.snippet.thumbnails?.default?.url ?? null,
    subscriberCount: it.statistics?.subscriberCount ?? null,
  }));
}

export interface ResumableInitOptions {
  accessToken: string;
  sizeBytes: number;
  contentType: string;
  title: string;
  description: string;
  tags: string[];
  categoryId?: string;
  privacyStatus: "public" | "unlisted" | "private";
  publishAt?: string | null;
  madeForKids?: boolean;
  isShort?: boolean;
  defaultLanguage?: string;
  defaultAudioLanguage?: string;
}

export async function startResumableUpload(
  opts: ResumableInitOptions,
): Promise<{ sessionUri: string }> {
  const isShort = !!opts.isShort;
  const tags = isShort ? [...opts.tags, "#Shorts"] : opts.tags;
  const metadata = {
    snippet: {
      title: isShort && !opts.title.includes("#Shorts") ? `${opts.title} #Shorts` : opts.title,
      description: opts.description,
      tags,
      categoryId: opts.categoryId ?? "22",
      ...(opts.defaultLanguage ? { defaultLanguage: opts.defaultLanguage } : {}),
      ...(opts.defaultAudioLanguage
        ? { defaultAudioLanguage: opts.defaultAudioLanguage }
        : opts.defaultLanguage
          ? { defaultAudioLanguage: opts.defaultLanguage }
          : {}),
    },
    status: {
      privacyStatus: opts.publishAt ? "private" : opts.privacyStatus,
      publishAt: opts.publishAt ?? undefined,
      selfDeclaredMadeForKids: opts.madeForKids ?? false,
    },
  };
  const params = new URLSearchParams({
    part: "snippet,status",
    uploadType: "resumable",
  });
  const res = await fetch(
    `https://www.googleapis.com/upload/youtube/v3/videos?${params.toString()}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": String(opts.sizeBytes),
        "X-Upload-Content-Type": opts.contentType,
      },
      body: JSON.stringify(metadata),
    },
  );
  if (!res.ok) {
    throw new Error(
      `resumable init ${res.status}: ${(await res.text()).slice(0, 300)}`,
    );
  }
  const sessionUri = res.headers.get("location");
  if (!sessionUri) {
    throw new Error("resumable init returned no Location header");
  }
  return { sessionUri };
}

export async function addToPlaylist(
  accessToken: string,
  videoId: string,
  playlistId: string,
): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        snippet: {
          playlistId,
          resourceId: { kind: "youtube#video", videoId },
        },
      }),
    },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`playlistItems.insert ${res.status}: ${detail.slice(0, 300)}`);
  }
}

export interface UploadOptions {
  accessToken: string;
  videoBytes: Uint8Array;
  contentType: string;
  title: string;
  description: string;
  tags: string[];
  categoryId?: string;
  privacyStatus: "public" | "unlisted" | "private";
  publishAt?: string | null;
  madeForKids?: boolean;
  isShort?: boolean;
  defaultLanguage?: string;
  defaultAudioLanguage?: string;
  playlistId?: string;
}

export async function uploadVideo(opts: UploadOptions): Promise<{ videoId: string }> {
  // YouTube resumable upload, single-request mode (works up to ~256MB reliably).
  // For larger files we'd implement chunked resumable: this is a known TODO.
  const isShort = !!opts.isShort;
  const tags = isShort ? [...opts.tags, "#Shorts"] : opts.tags;
  const metadata = {
    snippet: {
      title: isShort && !opts.title.includes("#Shorts") ? `${opts.title} #Shorts` : opts.title,
      description: opts.description,
      tags,
      categoryId: opts.categoryId ?? "22",
      ...(opts.defaultLanguage ? { defaultLanguage: opts.defaultLanguage } : {}),
      ...(opts.defaultAudioLanguage
        ? { defaultAudioLanguage: opts.defaultAudioLanguage }
        : opts.defaultLanguage
          ? { defaultAudioLanguage: opts.defaultLanguage }
          : {}),
    },
    status: {
      privacyStatus: opts.publishAt ? "private" : opts.privacyStatus,
      publishAt: opts.publishAt ?? undefined,
      selfDeclaredMadeForKids: opts.madeForKids ?? false,
    },
  };

  const params = new URLSearchParams({
    part: "snippet,status",
    uploadType: "multipart",
  });

  const boundary = `onpod-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${opts.contentType}\r\nContent-Transfer-Encoding: binary\r\n\r\n`;
  const tail = `\r\n--${boundary}--\r\n`;

  const encoder = new TextEncoder();
  const headBytes = encoder.encode(head);
  const tailBytes = encoder.encode(tail);
  const body = new Uint8Array(headBytes.length + opts.videoBytes.length + tailBytes.length);
  body.set(headBytes, 0);
  body.set(opts.videoBytes, headBytes.length);
  body.set(tailBytes, headBytes.length + opts.videoBytes.length);

  const res = await fetch(
    `https://www.googleapis.com/upload/youtube/v3/videos?${params.toString()}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": String(body.length),
      },
      body,
    },
  );

  if (!res.ok) {
    throw new Error(`videos.insert failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { id?: string };
  if (!data.id) throw new Error("videos.insert returned no id");

  // Add to playlist if requested — surface failures, don't silently drop them.
  if (opts.playlistId) {
    try {
      await addToPlaylist(opts.accessToken, data.id, opts.playlistId);
    } catch (err) {
      console.error("[playlist add failed]", err);
      throw err;
    }
  }

  return { videoId: data.id };
}

export async function setThumbnail(
  accessToken: string,
  videoId: string,
  imageBytes: Uint8Array,
  contentType: string,
): Promise<{ defaultUrl?: string }> {
  // uploadType=media is required for this endpoint when sending raw bytes —
  // otherwise YouTube accepts the call but ignores the body.
  const params = new URLSearchParams({ videoId, uploadType: "media" });
  // Copy into a fresh ArrayBuffer so we don't hit SharedArrayBuffer / view
  // strangeness in the serverless runtime.
  const buf = new ArrayBuffer(imageBytes.byteLength);
  new Uint8Array(buf).set(imageBytes);

  // Up to 3 attempts — YouTube sometimes rejects thumbnail.set on a video
  // that's still in the first seconds of processing.
  let lastStatus = 0;
  let lastBody = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2000 * attempt));
    const res = await fetch(
      `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?${params.toString()}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": contentType,
          "Content-Length": String(imageBytes.byteLength),
        },
        body: buf,
      },
    );
    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as {
        items?: Array<{ default?: { url?: string } }>;
      };
      return { defaultUrl: data.items?.[0]?.default?.url };
    }
    lastStatus = res.status;
    lastBody = await res.text();
    // 400 / 403 / 404 won't fix themselves — bail immediately
    if (res.status < 500 && res.status !== 429) break;
  }
  throw new Error(
    `thumbnails.set ${lastStatus}: ${lastBody.slice(0, 400)}`,
  );
}
