import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getFreshAccessToken } from "@/lib/youtube-store";

// Query a YouTube resumable upload session to find out what bytes have
// been received and (if complete) get the videoId.
//
// This exists because YouTube does NOT send Access-Control-Allow-Origin
// on the FINAL response of a resumable upload (intermediate 308s do).
// Browser fetch can't read the response body, so we use this server-side
// hop to discover the videoId after the bytes have already landed.

export const maxDuration = 60;

interface Body {
  sessionUri: string;
  totalSize: number;
}

export async function POST(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { sessionUri, totalSize } = (await req.json()) as Body;
  if (!sessionUri || !totalSize) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const accessToken = await getFreshAccessToken(user.id);
  if (!accessToken) {
    return NextResponse.json({ error: "no_token" }, { status: 401 });
  }

  // PUT with Content-Range: bytes */<total> and empty body asks YouTube
  // "what's the status of this upload session?".
  // 200/201 + body = upload complete, body is the video resource.
  // 308 = still receiving (Range header tells us how much).
  const res = await fetch(sessionUri, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Length": "0",
      "Content-Range": `bytes */${totalSize}`,
    },
  });

  if (res.status === 200 || res.status === 201) {
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return NextResponse.json({
      status: "complete",
      videoId: data.id ?? null,
    });
  }
  if (res.status === 308) {
    return NextResponse.json({
      status: "incomplete",
      range: res.headers.get("range"),
    });
  }
  const text = await res.text().catch(() => "");
  return NextResponse.json(
    {
      status: "error",
      code: res.status,
      message: text.slice(0, 400),
    },
    { status: 200 },
  );
}
