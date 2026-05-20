// Identify up to 4 distinct people across the supplied video frames.
// Returns normalized bounding boxes; the browser crops each region and
// runs remove-bg per person so the thumbnail flow gets up to 4 ready
// cutout PNGs.

import { NextResponse } from "next/server";
import { decodeFileId } from "@/lib/b2";
import { canAccessKey } from "@/lib/access";
import { requireSession } from "@/lib/session";
import { findPeopleInFrames } from "@/lib/claude-vision";

export const maxDuration = 60;

interface Body {
  fileId: string;
  framesBase64: string[];
}

export async function POST(req: Request) {
  const user = requireSession();
  const body = (await req.json()) as Body;
  if (
    !body.fileId ||
    !Array.isArray(body.framesBase64) ||
    body.framesBase64.length === 0
  ) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  let key: string;
  try {
    key = decodeFileId(body.fileId);
  } catch {
    return NextResponse.json({ error: "invalid_file_id" }, { status: 400 });
  }
  if (!canAccessKey(user, key)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const people = await findPeopleInFrames(body.framesBase64);
    return NextResponse.json({ people });
  } catch (err) {
    return NextResponse.json(
      { error: "vision_error", message: (err as Error).message },
      { status: 500 },
    );
  }
}
