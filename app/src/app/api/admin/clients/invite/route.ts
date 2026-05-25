// Admin/editor invites a new client. Creates the user (no password —
// magic-link only), issues a token, emails it via Resend. Idempotent on
// email: if the user already exists we reissue a magic link instead of
// erroring.
//
// Designed to be callable by:
//   - The admin /clients UI (admin/editor session cookie)
//   - n8n workflows that detect new bookings (header X-Onpod-Service-Key
//     matches the env value)

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createUser, getUserByEmail } from "@/lib/auth-store";
import { issueMagicToken, buildMagicLinkUrl } from "@/lib/magic-link";
import { sendEmail, welcomeMagicLinkEmail } from "@/lib/email";
import {
  updateUserHomeStudio,
  updateUserSelfUpload,
  updateEditorAssignment,
  updateUserRole,
} from "@/lib/auth-store";
import { listStudios } from "@/lib/studio-registry";

interface Body {
  email: string;
  firstName?: string;
  lastName?: string;
  // Phase 3.1: invite can mint editors or admins too. Studio multi-select
  // on the client supplies assignedStudios for scoping.
  role?: "client" | "editor" | "admin";
  // Where the client's workspace lives. Defaults to "externals" for
  // manual invites (per the spec).
  homeStudio?: string;
  // Optional — defaults true for externals, false otherwise.
  selfUploadEnabled?: boolean;
  // For editor + admin invites: which studios they're scoped to. Empty
  // array on an admin = super-admin. Empty on an editor = sees nothing.
  assignedStudios?: string[];
}

function siteOrigin(req: Request): string {
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return new URL(req.url).origin;
}

function authorize(req: Request): { ok: true } | { ok: false; res: NextResponse } {
  // Service token (n8n) bypasses the cookie session.
  const svc = req.headers.get("x-onpod-service-key");
  if (svc && process.env.ONPOD_SERVICE_KEY && svc === process.env.ONPOD_SERVICE_KEY) {
    return { ok: true };
  }
  const user = getSession();
  if (!user) {
    return { ok: false, res: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  if (user.role !== "admin" && (user.role as string) !== "editor") {
    return {
      ok: false,
      res: NextResponse.json({ error: "forbidden", message: "Admin/editor only." }, { status: 403 }),
    };
  }
  return { ok: true };
}

export async function POST(req: Request) {
  const gate = authorize(req);
  if (!gate.ok) return gate.res;

  const body = (await req.json().catch(() => null)) as Body | null;
  const email = body?.email?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }
  const firstName = body?.firstName?.trim() ?? "";
  const lastName = body?.lastName?.trim() ?? "";

  const role = body?.role ?? "client";
  const validRoles = ["client", "editor", "admin"] as const;
  if (!validRoles.includes(role as (typeof validRoles)[number])) {
    return NextResponse.json({ error: "invalid_role" }, { status: 400 });
  }
  const liveStudios = await listStudios().catch(() => []);
  const knownSlugs = new Set(liveStudios.map((s) => s.slug));
  const studioFromBody = body?.homeStudio;
  const homeStudio =
    role === "client"
      ? studioFromBody && knownSlugs.has(studioFromBody)
        ? studioFromBody
        : "externals"
      : null;
  const selfUploadEnabled =
    body?.selfUploadEnabled ?? (homeStudio === "externals");
  // Editor / admin scoping. Filter to known slugs so typos don't
  // silently scope someone to a non-existent studio.
  const assignedStudios =
    role === "editor" || role === "admin"
      ? (body?.assignedStudios ?? []).filter((s) => knownSlugs.has(s))
      : [];

  // Reuse the existing row if present — n8n will fire this on every
  // booking even for returning clients, and we want that to be a no-op
  // beyond reissuing the link.
  let user = await getUserByEmail(email);
  let created = false;
  if (!user) {
    const placeholderPassword = `m_${Math.random().toString(36).slice(2, 18)}`;
    user = await createUser({
      email,
      password: placeholderPassword,
      firstName: firstName || email.split("@")[0],
      lastName: lastName || "",
      role,
    });
    created = true;
  } else if (user.role !== role) {
    // Re-invite with a different role — upgrade in place. Idempotent.
    await updateUserRole(user.id, role).catch((err) =>
      console.warn("[clients/invite] role update failed", err),
    );
  }

  // Apply workspace + self-upload settings (idempotent — safe on re-invites).
  if (role === "client") {
    if (homeStudio) {
      await updateUserHomeStudio(user.id, homeStudio).catch((err) =>
        console.warn("[clients/invite] homeStudio update failed", err),
      );
    }
    await updateUserSelfUpload(user.id, selfUploadEnabled).catch((err) =>
      console.warn("[clients/invite] selfUpload update failed", err),
    );
  } else if (role === "editor" || role === "admin") {
    // Editor scoping column doubles as admin scoping column.
    await updateEditorAssignment(user.id, {
      assignedStudios,
      excludedClientEmails: [],
    }).catch((err) =>
      console.warn("[clients/invite] assignedStudios update failed", err),
    );
  }

  const { token, expiresAt } = await issueMagicToken(email);
  const signInUrl = buildMagicLinkUrl(siteOrigin(req), token);
  const tmpl = welcomeMagicLinkEmail({ firstName: user.firstName, signInUrl });
  let sent = false;
  let sendError: string | undefined;
  try {
    await sendEmail({ to: email, subject: tmpl.subject, html: tmpl.html, text: tmpl.text });
    sent = true;
  } catch (err) {
    sendError = (err as Error).message;
    console.error("[clients/invite] email send failed", { email, sendError });
  }

  return NextResponse.json({
    ok: true,
    userId: user.id,
    created,
    homeStudio,
    selfUploadEnabled,
    expiresAt: expiresAt.toISOString(),
    sent,
    sendError,
    // Surface the link when there's no API key (dev) OR when the send
    // failed (e.g. Resend domain not yet verified). Admin can copy it
    // manually as a fallback. Once Resend verifies the domain and sends
    // succeed, this field stays undefined.
    devLink: !process.env.RESEND_API_KEY || !sent ? signInUrl : undefined,
  });
}
