// POST — mark revisions as "in_review" and email the assigned editor.
// Email recipient is resolved in this order:
//   1) revisions.assignedEditorEmail (set on the file itself)
//   2) the requesting user's assignedEditorEmail (set on the user record)
//   3) STUDIO_REVIEWS_EMAIL env (catch-all studio inbox)
// If none resolve, we still mark in_review and surface the missing-recipient
// state to the client UI.

import { NextResponse } from "next/server";
import { decodeFileId, publicUrl } from "@/lib/b2";
import { requireSession } from "@/lib/session";
import { canAccessKey } from "@/lib/access";
import { emptyRevisions, getRevisions, saveRevisions } from "@/lib/revisions-store";
import { sendEmail } from "@/lib/email";
import {
  getUserByEmail as getStoredUserByEmail,
  listAllUsers as listStoredUsers,
} from "@/lib/auth-store";
import { getExternalEditor } from "@/lib/external-editor-store";
import { mockUsers } from "@/lib/mock-data";
import { parseKey, STUDIO_ROOT } from "@/lib/studio";
import { setFileMetaEntry } from "@/lib/file-meta-store";

function metaKeysFor(key: string): { ownerId: string; projectId: string } | null {
  if (!key.startsWith(STUDIO_ROOT)) return null;
  const parsed = parseKey(key);
  if (!parsed.studio || !parsed.bucket || !parsed.sessionFolder) return null;
  return {
    ownerId: "studios",
    projectId: `studio:${parsed.studio}:${parsed.bucket}:${parsed.sessionFolder}`,
  };
}

export const maxDuration = 30;

function reviewLinkFor(req: Request, key: string): string {
  const origin = process.env.NEXTAUTH_URL ?? new URL(req.url).origin;
  const parsed = parseKey(key);
  if (parsed.studio && parsed.bucket && parsed.sessionFolder) {
    // Staff opens it from the admin tree
    return `${origin}/admin/studios/${parsed.studio}/${parsed.bucket}/${encodeURIComponent(parsed.sessionFolder)}`;
  }
  return `${origin}${publicUrl(key)}`;
}

function buildEmail(args: {
  clientName: string;
  fileLabel: string;
  notesCount: number;
  url: string;
  // When sending to an external (freelance) editor, the email mentions
  // that the link is a one-click guest sign-in — no password to wrangle.
  isGuestLink?: boolean;
}): { subject: string; html: string; text: string } {
  const subject = `Review request: ${args.fileLabel} (${args.notesCount} ${
    args.notesCount === 1 ? "note" : "notes"
  })`;
  const linkLabel = args.isGuestLink ? "Open as guest editor" : "Open in OnPod";
  const guestFootnote = args.isGuestLink
    ? `<p style="color:#6b6b73;font-size:12px;">This is a one-click guest sign-in scoped to ${args.clientName}'s files. Bookmark it — it works until ${args.clientName} revokes access.</p>`
    : "";
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
      <h1 style="font-size: 22px;">Review request from ${args.clientName}</h1>
      <p>${args.clientName} has asked you to review <b>${args.fileLabel}</b>.</p>
      <p>There ${args.notesCount === 1 ? "is 1 note" : `are ${args.notesCount} notes`} to address.</p>
      <p style="margin: 24px 0;">
        <a href="${args.url}" style="background: #ff3b30; color: white; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          ${linkLabel}
        </a>
      </p>
      ${guestFootnote}
    </div>
  `;
  const text = `Review request from ${args.clientName}\n\n${args.notesCount} ${args.notesCount === 1 ? "note" : "notes"} on ${args.fileLabel}.\n\n${linkLabel}: ${args.url}`;
  return { subject, html, text };
}

export async function POST(
  req: Request,
  { params }: { params: { fileId: string } },
) {
  const user = requireSession();
  let key: string;
  try {
    key = decodeFileId(params.fileId);
  } catch {
    return NextResponse.json({ error: "invalid_file_id" }, { status: 400 });
  }
  if (!canAccessKey(user, key)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const file = (await getRevisions(key)) ?? emptyRevisions();
  file.status = "in_review";
  file.reviewSentAt = Date.now();
  await saveRevisions(key, file);

  // Flip the file's approvalStatus to "rejected" — that's the signal the
  // file-row badge reads to render "In revision". Editor uploading a
  // new version flips it back to "pending" → "Ready for approval".
  const meta = metaKeysFor(key);
  if (meta) {
    await setFileMetaEntry(meta.ownerId, meta.projectId, key, {
      approvalStatus: "rejected",
    }).catch((err) => console.warn("[revisions/send] meta flip failed", err));
  }

  // Resolve recipient — checked in order:
  //   1. revisions file-level assignment (explicit override)
  //   2. user's external editor (their own freelancer)  ← new
  //   3. user.assignedEditorEmail (OnPod team)
  //   4. STUDIO_REVIEWS_EMAIL env (catch-all inbox)
  //   5. fallback: first editor account on the system (mock OR B2)
  let recipient = file.assignedEditorEmail;
  let isGuestLink = false;
  let guestUrl: string | null = null;
  if (!recipient) {
    const guestEditor = await getExternalEditor(user.id).catch(() => null);
    if (guestEditor) {
      recipient = guestEditor.email;
      isGuestLink = true;
      const origin = process.env.NEXTAUTH_URL ?? new URL(req.url).origin;
      guestUrl = `${origin}/guest/${encodeURIComponent(guestEditor.token)}`;
    }
  }
  if (!recipient) {
    const stored = await getStoredUserByEmail(user.email);
    const fromStored = (stored as { assignedEditorEmail?: string } | null)?.assignedEditorEmail;
    if (fromStored) recipient = fromStored;
  }
  if (!recipient) recipient = process.env.STUDIO_REVIEWS_EMAIL ?? undefined;
  if (!recipient) {
    const realEditor = (await listStoredUsers()).find((u) => u.role === "editor");
    if (realEditor) recipient = realEditor.email;
  }
  if (!recipient) {
    const mockEditor = mockUsers.find((u) => u.role === "editor");
    if (mockEditor) recipient = mockEditor.email;
  }

  const clientName = `${user.firstName} ${user.lastName}`.trim() || user.email;
  const filename = key.split("/").slice(-1)[0] ?? "video";
  // For external editors, point them at the guest sign-in URL — that
  // signs them in as a scoped guest and drops them on /account where the
  // file is reachable. Internal editors get the admin deep link.
  const url = isGuestLink && guestUrl ? guestUrl : reviewLinkFor(req, key);
  const openCount = file.notes.filter((n) => n.status === "open").length;

  if (!recipient) {
    return NextResponse.json({
      ok: true,
      sent: false,
      message: "No assigned editor and STUDIO_REVIEWS_EMAIL not set — saved but not emailed.",
      revisions: file,
    });
  }

  const tmpl = buildEmail({
    clientName,
    fileLabel: filename,
    notesCount: openCount || file.notes.length,
    url,
    isGuestLink,
  });
  try {
    await sendEmail({
      to: recipient,
      subject: tmpl.subject,
      html: tmpl.html,
      text: tmpl.text,
    });
    return NextResponse.json({
      ok: true,
      sent: true,
      recipient,
      revisions: file,
    });
  } catch (err) {
    return NextResponse.json({
      ok: true,
      sent: false,
      message: (err as Error).message,
      recipient,
      revisions: file,
    });
  }
}
