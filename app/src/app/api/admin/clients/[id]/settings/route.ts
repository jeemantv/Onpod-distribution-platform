// Admin updates a client's workspace settings — home studio + self-upload
// permission. Same auth model as the plan route (admin-only via inline
// JSON 403, not requireAdmin redirect).

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  updateUserHomeStudio,
  updateUserSelfUpload,
  getUserById,
} from "@/lib/auth-store";
import { isKnownStudio } from "@/lib/studio-registry";
import { assertClientAccess, assertStudioAccess } from "@/lib/editor-access";

interface Body {
  homeStudio?: string | null;
  selfUploadEnabled?: boolean;
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "admin") {
    return NextResponse.json(
      { error: "forbidden", message: "Only admins can change client settings." },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // Scoped admin can only touch their own clients.
  const target = await getUserById(params.id);
  if (!target) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const blockedClient = await assertClientAccess({
    clientEmail: target.email,
    clientHomeStudio: target.homeStudio ?? null,
  });
  if (blockedClient) return blockedClient;

  if (body.homeStudio !== undefined) {
    const v = body.homeStudio;
    if (v !== null) {
      // Studio must exist + actor must own it (can't move someone else's
      // client into our studio either).
      if (!(await isKnownStudio(v))) {
        return NextResponse.json(
          { error: "invalid_studio", message: `Unknown studio "${v}".` },
          { status: 400 },
        );
      }
      const blockedStudio = await assertStudioAccess(v);
      if (blockedStudio) return blockedStudio;
    }
    await updateUserHomeStudio(params.id, v);
  }
  if (body.selfUploadEnabled !== undefined) {
    await updateUserSelfUpload(params.id, !!body.selfUploadEnabled);
  }

  return NextResponse.json({ ok: true });
}
