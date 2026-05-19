import { NextResponse } from "next/server";

// TODO: spec §11.2 — mark unapproved Edited/Clips files as pending, send Resend email.
export async function POST(req: Request) {
  const body = (await req.json()) as {
    projectId: string;
    to: string;
    subject: string;
    body: string;
  };
  console.log("[approval-request] email", body.to, body.subject);
  return NextResponse.json({ sent: true });
}
