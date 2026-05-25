import { NextResponse } from "next/server";
import { completeMultipartUpload } from "@/lib/b2";
import { getSession } from "@/lib/session";
import { getUserByEmail } from "@/lib/auth-store";
import { STUDIO_ROOT, parseKey, sessionBelongsToEmail } from "@/lib/studio";

export const maxDuration = 60;

export async function POST(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { key, uploadId, parts } = (await req.json()) as {
    key: string;
    uploadId: string;
    parts: { partNumber: number; etag: string }[];
  };
  if (!key || !uploadId || !Array.isArray(parts) || parts.length === 0) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (!key.startsWith(STUDIO_ROOT)) {
    return NextResponse.json({ error: "invalid_key" }, { status: 400 });
  }

  if (user.role !== "admin" && (user.role as string) !== "editor") {
    const stored = await getUserByEmail(user.email).catch(() => null);
    if (!stored?.selfUploadEnabled) {
      return NextResponse.json(
        { error: "forbidden", message: "Self-upload isn't enabled for your account." },
        { status: 403 },
      );
    }
    const parsed = parseKey(key);
    if (!parsed.sessionFolder || !sessionBelongsToEmail(parsed.sessionFolder, user.email)) {
      return NextResponse.json(
        { error: "forbidden", message: "You can only finalize uploads in your own session folder." },
        { status: 403 },
      );
    }
  }

  try {
    const result = await completeMultipartUpload(key, uploadId, parts);
    return NextResponse.json({ key: result.key, sizeBytes: result.sizeBytes });
  } catch (err) {
    console.error("[admin/upload-complete]", err);
    return NextResponse.json(
      { error: "b2_error", message: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
