import { NextResponse } from "next/server";

// TODO: spec §11.3 — flip approval status, audit who decided.
export async function POST(
  req: Request,
  { params }: { params: { fileId: string } },
) {
  const { status, note } = (await req.json()) as {
    status: "approved" | "rejected" | "pending";
    note?: string;
  };
  return NextResponse.json({
    fileId: params.fileId,
    status,
    note,
    decidedAt: new Date().toISOString(),
  });
}
