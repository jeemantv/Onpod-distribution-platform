import Link from "next/link";
import { TopNav } from "@/components/TopNav";
import { requireSession } from "@/lib/session";
import { getCreditsForUser } from "@/lib/mock-data";
import { PLAN_LIMITS } from "@/lib/types";
import { SignOutButton } from "./_components/SignOutButton";
import { ExternalEditorCard } from "./_components/ExternalEditorCard";
import { DelegatesCard } from "./_components/DelegatesCard";
import { effectivePlan, getUserByEmail, trialStateFor } from "@/lib/auth-store";
import { getConnection } from "@/lib/youtube-store";
import { getBuzzsproutCreds } from "@/lib/buzzsprout-store";

export const dynamic = "force-dynamic";

// Settings is reachable from every role (avatar menu). Each role sees a
// curated slice: clients keep billing + cancel-subscription, editors get
// review/edit notifications, admins are punted at the admin panel.
export default async function SettingsPage() {
  const user = requireSession();
  // Guest sessions are role="editor" but acting on a client's account.
  // They see profile only — no billing, plan, notification, connection,
  // or team-management cards. The guest banner already explains the
  // mode at the top via TopNav.
  const isGuest = !!user.guest;
  const isClient = user.role === "client" && !isGuest;
  const isEditor = user.role === "editor" && !isGuest;
  // Effective plan from DB so post-Stripe upgrades reflect immediately
  // (the session JWT lags one re-login behind otherwise).
  const stored = isClient ? await getUserByEmail(user.email).catch(() => null) : null;
  const livePlan = stored ? effectivePlan(stored) : user.plan;
  const credits = isClient ? getCreditsForUser(user.id) : undefined;
  const limits = isClient
    ? (PLAN_LIMITS as Record<string, (typeof PLAN_LIMITS)[keyof typeof PLAN_LIMITS]>)[livePlan] ?? null
    : null;
  const trial = stored ? trialStateFor(stored) : { active: false, daysLeft: 0, endsAt: null };
  const displayPlanLabel = trial.active
    ? `Free trial · ${trial.daysLeft} day${trial.daysLeft === 1 ? "" : "s"} left`
    : limits?.label ?? livePlan;
  const youtube = isClient ? await getConnection(user.id).catch(() => null) : null;
  const buzzsprout = isClient ? await getBuzzsproutCreds(user.id).catch(() => null) : null;
  const backHref = isClient ? "/account" : "/admin/studios";

  return (
    <>
      <TopNav user={user} backHref={backHref} backLabel="Back" />
      <main className="max-w-[860px] mx-auto px-8 py-10">
        <h1 className="display text-[36px] mb-1">Settings</h1>
        <p className="text-text-muted text-[13px] mb-8">
          {isClient
            ? "Profile, billing, and platform connections."
            : isEditor
              ? "Profile and notification preferences."
              : "Profile and notifications."}
        </p>

        <Card title="Profile">
          <div className="flex items-center gap-4">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center font-semibold"
              style={{ background: user.avatarColor }}
            >
              {user.avatar}
            </div>
            <div>
              <div className="text-[15px] font-medium">
                {user.firstName} {user.lastName}
              </div>
              <div className="text-[13px] text-text-muted">{user.email}</div>
              <div className="text-[10px] uppercase tracking-wider text-text-dim mt-1">
                {user.role}
              </div>
            </div>
          </div>
        </Card>

        {isClient && limits ? (
          <Card title="Billing">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="text-[14px]">{displayPlanLabel}</div>
                <div className="text-[12px] text-text-muted mt-1">
                  {trial.active
                    ? `Unlimited features during trial · ${trial.endsAt ? `ends ${trial.endsAt.toLocaleDateString()}` : ""}`
                    : limits.priceCad === 0
                      ? limits.source === "onpod"
                        ? "Bundled with your OnPod studio package — no charge."
                        : "Admin-granted plan."
                      : `$${limits.priceCad} CAD / month · renews automatically`}
                </div>
              </div>
              <Link
                href="/settings/billing"
                className="px-4 py-2 rounded-[8px] bg-bg-elev-3 border border-border-strong text-[13px] hover:border-text-muted"
              >
                Manage billing
              </Link>
            </div>

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <BundleStat label="Episodes / month" value={fmtCap(limits.episodes)} />
              <BundleStat label="Reels / month" value={fmtCap(limits.reels)} />
              <BundleStat label="Thumbnails / month" value={fmtCap(limits.thumbnails)} />
            </div>

            {credits ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
                <Quota label="Episodes used" used={credits.podcastsUsed} total={limits.episodes} />
                <Quota label="Reels used" used={credits.opusClipsUsed} total={limits.reels} />
                <Quota label="Thumbnails used" used={credits.coverArtsUsed} total={limits.thumbnails} />
                <Quota label="Articles used" used={credits.articlesUsed} total={limits.articles} />
              </div>
            ) : null}
          </Card>
        ) : null}

        <Card title="Email notifications">
          {isClient ? (
            <>
              <Toggle label="Approval requests" defaultOn />
              <Toggle label="New version ready for review" defaultOn />
              <Toggle label="Clips ready" defaultOn />
              <Toggle label="Transcription ready" />
              <Toggle label="Weekly summary" />
            </>
          ) : isEditor ? (
            <>
              <Toggle label="New edit requests assigned to me" defaultOn />
              <Toggle label="Client review requests" defaultOn />
              <Toggle label="Approval responses from clients" defaultOn />
              <Toggle label="Weekly summary" />
            </>
          ) : (
            <>
              <Toggle label="Stripe payment failures" defaultOn />
              <Toggle label="New signups" />
              <Toggle label="Daily summary" />
            </>
          )}
        </Card>

        {isClient ? (
          <Card title="Platform connections">
            <Connection
              name="YouTube"
              connected={!!youtube}
              detail={
                youtube
                  ? `Posting as ${youtube.channels.find((c) => c.id === youtube.activeChannelId)?.title ?? "your channel"}`
                  : "Connect to publish episodes to YouTube"
              }
              href="/account"
            />
            <Connection
              name="Buzzsprout"
              connected={!!buzzsprout}
              detail={
                buzzsprout
                  ? `Podcast #${buzzsprout.podcastId} · auto-distributes to Spotify, Apple, Amazon Music`
                  : "Connect to publish episodes everywhere with one click"
              }
              href="/settings/podcast"
            />
            <Connection
              name="OnPod RSS feed (free path)"
              connected
              detail="Built-in podcast feed you can submit manually to Spotify / Apple if you don't use Buzzsprout"
              href="/settings/podcast"
            />
          </Card>
        ) : null}

        {isClient ? <ExternalEditorCard /> : null}

        {isClient ? <DelegatesCard /> : null}

        {isClient ? (
          <Card title="Subscription" tone="danger">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <p className="text-[13px] text-text-muted">
                Cancel your subscription. You&apos;ll keep access until the end of
                your current billing period, then lose access automatically.
              </p>
              <button className="px-4 py-2 rounded-[8px] bg-[rgba(239,68,68,0.12)] border border-[rgba(239,68,68,0.3)] text-[#f87171] text-[13px]">
                Cancel subscription
              </button>
            </div>
          </Card>
        ) : null}

        <div className="mt-8 flex justify-end">
          <SignOutButton />
        </div>
      </main>
    </>
  );
}

function Card({
  title,
  children,
  tone,
}: {
  title: string;
  children: React.ReactNode;
  tone?: "danger";
}) {
  return (
    <section
      className={`mb-5 p-6 rounded-[16px] border ${
        tone === "danger"
          ? "bg-[rgba(239,68,68,0.04)] border-[rgba(239,68,68,0.2)]"
          : "bg-bg-elev border-border"
      }`}
    >
      <h2 className="display text-[18px] mb-4">{title}</h2>
      {children}
    </section>
  );
}

function fmtCap(n: number): string {
  return isFinite(n) ? String(n) : "∞";
}

function BundleStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] bg-bg-elev-2 border border-border px-3 py-2.5">
      <div className="text-[11px] text-text-muted">{label}</div>
      <div className="display text-[20px] mt-0.5">{value}</div>
    </div>
  );
}

function Quota({ label, used, total }: { label: string; used: number; total: number }) {
  const isUnlimited = !isFinite(total);
  const pct = isUnlimited ? 0 : Math.min(100, (used / total) * 100);
  return (
    <div>
      <div className="flex items-center justify-between text-[12px] mb-1">
        <span className="text-text-muted">{label}</span>
        <span>
          {used} / {isUnlimited ? "∞" : total}
        </span>
      </div>
      <div className="h-1.5 bg-bg-elev-3 rounded-full overflow-hidden">
        <div className="h-full bg-accent rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Toggle({ label, defaultOn }: { label: string; defaultOn?: boolean }) {
  return (
    <label className="flex items-center justify-between py-2 text-[13px] cursor-pointer">
      <span>{label}</span>
      <input type="checkbox" defaultChecked={defaultOn} className="accent-accent w-4 h-4" />
    </label>
  );
}

function Connection({
  name,
  connected,
  detail,
  href,
}: {
  name: string;
  connected?: boolean;
  detail?: string;
  href?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 text-[13px] border-b border-border last:border-0">
      <div className="min-w-0 flex-1">
        <div className="font-medium">{name}</div>
        {detail ? (
          <div className="text-[11px] text-text-muted mt-0.5">{detail}</div>
        ) : null}
      </div>
      {connected ? (
        href ? (
          <Link
            href={href}
            className="px-3 py-1.5 rounded-[8px] bg-[rgba(16,185,129,0.12)] border border-[rgba(16,185,129,0.3)] text-[#34d399] text-[12px] shrink-0"
          >
            Connected · Manage
          </Link>
        ) : (
          <span className="px-3 py-1.5 rounded-[8px] bg-[rgba(16,185,129,0.12)] border border-[rgba(16,185,129,0.3)] text-[#34d399] text-[12px] shrink-0">
            Connected
          </span>
        )
      ) : href ? (
        <Link
          href={href}
          className="px-3 py-1.5 rounded-[8px] bg-bg-elev-3 border border-border hover:border-border-strong text-[12px] shrink-0"
        >
          Connect
        </Link>
      ) : (
        <span className="px-3 py-1.5 rounded-[8px] bg-bg-elev-3 border border-border text-text-muted text-[12px] shrink-0">
          Not connected
        </span>
      )}
    </div>
  );
}
