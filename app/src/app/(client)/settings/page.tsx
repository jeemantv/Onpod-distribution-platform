import { TopNav } from "@/components/TopNav";
import { requireClient } from "@/lib/session";
import { getCreditsForUser } from "@/lib/mock-data";
import { PLAN_LIMITS } from "@/lib/types";
import { SignOutButton } from "./_components/SignOutButton";

export default function SettingsPage() {
  const user = requireClient();
  const credits = getCreditsForUser(user.id);
  const limits = PLAN_LIMITS[user.plan];

  return (
    <>
      <TopNav user={user} backHref="/account" backLabel="Back" />
      <main className="max-w-[860px] mx-auto px-8 py-10">
        <h1 className="display text-[36px] mb-1">Settings</h1>
        <p className="text-text-muted text-[13px] mb-8">
          Profile, billing, and platform connections.
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
            </div>
          </div>
        </Card>

        <Card title="Billing">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[14px] capitalize">{user.plan} plan</div>
              <div className="text-[12px] text-text-muted mt-1">
                Renews automatically each month.
              </div>
            </div>
            <button className="px-4 py-2 rounded-[8px] bg-bg-elev-3 border border-border-strong text-[13px]">
              Manage billing
            </button>
          </div>
          {credits ? (
            <div className="grid grid-cols-4 gap-3 mt-5">
              <Quota label="Podcasts" used={credits.podcastsUsed} total={limits.podcasts} />
              <Quota label="Articles" used={credits.articlesUsed} total={limits.articles} />
              <Quota label="Clips" used={credits.opusClipsUsed} total={limits.opusClips} />
              <Quota label="Cover arts" used={credits.coverArtsUsed} total={limits.coverArts} />
            </div>
          ) : null}
        </Card>

        <Card title="Email notifications">
          <Toggle label="Approval requests" defaultOn />
          <Toggle label="Clips ready" defaultOn />
          <Toggle label="Transcription ready" />
          <Toggle label="Weekly summary" />
        </Card>

        <Card title="Platform connections">
          <Connection name="YouTube" connected />
          <Connection name="Spotify (RSS)" connected />
          <Connection name="Apple Podcasts (RSS)" />
        </Card>

        <Card title="Danger zone" tone="danger">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <p className="text-[13px] text-text-muted">
              Soft-deletes your account. OnPod admins can restore for 30 days.
            </p>
            <button className="px-4 py-2 rounded-[8px] bg-[rgba(239,68,68,0.12)] border border-[rgba(239,68,68,0.3)] text-[#f87171] text-[13px]">
              Delete account
            </button>
          </div>
        </Card>

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
        <div
          className="h-full bg-accent rounded-full"
          style={{ width: `${pct}%` }}
        />
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
