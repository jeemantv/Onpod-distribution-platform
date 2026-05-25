import { TopNav } from "@/components/TopNav";
import { requireSession } from "@/lib/session";
import { getCreditsForUser } from "@/lib/mock-data";
import { PLAN_LIMITS } from "@/lib/types";
import { SignOutButton } from "./_components/SignOutButton";

// Settings is reachable from every role (avatar menu). Each role sees a
// curated slice: clients keep billing + cancel-subscription, editors get
// review/edit notifications, admins are punted at the admin panel.
export default function SettingsPage() {
  const user = requireSession();
  const isClient = user.role === "client";
  const isEditor = user.role === "editor";
  const credits = isClient ? getCreditsForUser(user.id) : undefined;
  const limits = isClient ? PLAN_LIMITS[user.plan] : null;
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
                <div className="text-[14px]">{limits.label}</div>
                <div className="text-[12px] text-text-muted mt-1">
                  {limits.priceCad === 0
                    ? limits.source === "onpod"
                      ? "Bundled with your OnPod studio package — no charge."
                      : "Admin-granted plan."
                    : `$${limits.priceCad} CAD / month · renews automatically`}
                </div>
              </div>
              <button className="px-4 py-2 rounded-[8px] bg-bg-elev-3 border border-border-strong text-[13px]">
                Manage billing
              </button>
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
            <Connection name="YouTube" connected />
            <Connection name="Spotify (RSS)" connected />
            <Connection name="Apple Podcasts (RSS)" />
          </Card>
        ) : null}

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

function Connection({ name, connected }: { name: string; connected?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 text-[13px]">
      <span>{name}</span>
      {connected ? (
        <button className="px-3 py-1.5 rounded-[8px] bg-[rgba(16,185,129,0.12)] border border-[rgba(16,185,129,0.3)] text-[#34d399] text-[12px]">
          Connected · Manage
        </button>
      ) : (
        <button className="px-3 py-1.5 rounded-[8px] bg-bg-elev-3 border border-border text-[12px]">
          Connect
        </button>
      )}
    </div>
  );
}
