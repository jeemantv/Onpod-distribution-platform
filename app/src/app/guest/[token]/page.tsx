// /guest/<token> — external editor redemption. Looks up the token,
// signs the visitor in as a guest session anchored to the client's
// identity (so canAccessKey passes for that client's files) but with
// the guest's real email + name on the session payload for audit.

import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { findClientByGuestToken } from "@/lib/external-editor-store";
import { setGuestSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function GuestRedeemPage({
  params,
}: {
  params: { token: string };
}) {
  const redemption = await findClientByGuestToken(params.token);
  if (!redemption) notFound();

  // Compose a SignInUserShape from the client's stored identity. Avatar
  // and avatarColor aren't on the redemption row — set bland defaults so
  // the TopNav still renders if the host viewer reaches a page that
  // reads them.
  const initials =
    (redemption.clientFirstName[0] ?? "?") +
    (redemption.clientLastName[0] ?? "");
  // Role is "editor" so canMarkDone-style gates flip on for the guest —
  // they can leave/resolve revision notes and upload new versions on
  // this client's files. canAccessKey narrows the editor's blast radius
  // back down to the client's prefix when session.guest is set.
  setGuestSession({
    client: {
      id: redemption.clientId,
      email: redemption.clientEmail,
      firstName: redemption.clientFirstName,
      lastName: redemption.clientLastName,
      avatar: initials.toUpperCase().slice(0, 2),
      avatarColor: "#6b7280",
      role: "editor",
    },
    guest: {
      email: redemption.guestEmail,
      name: redemption.guestName,
    },
  });
  redirect("/account");
}
