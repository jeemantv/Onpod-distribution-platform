import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

// TODO: spec §10.1 — generate B2 pre-signed download URL, insert into `downloads`.
export async function POST(
  _req: Request,
  { params }: { params: { fileId: string } },
) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({
    signedUrl: `https://b2-mock.example.com/download/${params.fileId}?sig=abc`,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  });
}
