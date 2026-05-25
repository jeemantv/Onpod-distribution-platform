// Public studio signup landing. Renders a minimal form bound to a
// pre-issued invite token. On submit it hits the public accept route
// which creates the user + emails them a magic link.

import { notFound } from "next/navigation";
import { getStudioInviteByToken, getStudio } from "@/lib/studio-registry";
import { InviteAcceptForm } from "./_InviteAcceptForm";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

export default async function StudioInvitePage({
  params,
}: {
  params: { token: string };
}) {
  const invite = await getStudioInviteByToken(params.token);
  if (!invite) notFound();
  const studio = await getStudio(invite.studioSlug);
  if (!studio) notFound();

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-10">
          <Logo size={28} />
        </div>
        <div className="bg-bg-elev border border-border rounded-xl p-8 shadow-float">
          <h1 className="display text-[28px] mb-1">
            Join {studio.displayName}
          </h1>
          <p className="text-text-muted text-[13px] mb-6">
            Enter your email and we&apos;ll send you a sign-in link. No password
            needed.
          </p>
          <InviteAcceptForm
            token={params.token}
            studioName={studio.displayName}
            paymentLinkUrl={studio.paymentLinkUrl}
          />
        </div>
        <p className="text-center text-[11px] text-text-dim mt-6">
          Powered by OnPod
        </p>
      </div>
    </main>
  );
}
