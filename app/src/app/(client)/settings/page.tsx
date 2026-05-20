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
              <div className="text-[14px]">{limits.label}</div>
              <div className="text-[12px] text-text-muted mt-1">
                {limits.priceUsd === 0
                  ? limits.source === "onpod"
                    ? "Bundled with your OnPod studio package — no charge."
                    : "Admin-granted plan."
                  : `$${limits.priceUsd} USD / month · renews automatically`}
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

        <Card title="Other plans">
          <p className="text-[12px] text-text-muted mb-3">
            Need more? Upgrade or get in touch.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <PlanCard
              title="OnPod Studio (free bundle)"
              price="Free"
              bundle="6 · 60 · 10"
              note="Bundled with your OnPod studio package"
            />
            <PlanCard
              title="OnPod Studio direct"
              price="$39 / mo"
              bundle="6 · 60 · 10"
              note="OnPod clients, not on a studio plan"
            />
            <PlanCard
              title="OnPod Studio direct ×2"
              price="$89 / mo"
              bundle="12 · 120 · 20"
              note="Higher-volume OnPod direct creators"
            />
            <PlanCard
              title="External clients"
              price="$89 / mo"
              bundle="6 · 60 · 10"
              note="Clients of partner / external studios"
            />
            <PlanCard
              title="External clients ×2"
              price="$120 / mo"
              bundle="12 · 120 · 20"
              note="2× bundle for external-studio clients"
            />
          </div>
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

function PlanCard({
  title,
  price,
  bundle,
  note,
}: {
  title: string;
  price: string;
  bundle: string;
  note: string;
}) {
  return (
    <div className="rounded-[10px] bg-bg-elev-2 border border-border px-4 py-3">
      <div className="flex items-baseline justify-between">
        <div className="font-medium text-[14px]">{title}</div>
        <div className="text-[13px] text-text-muted">{price}</div>
      </div>
      <div className="text-[13px] mt-1">{bundle}</div>
      <div className="text-[11px] text-text-dim mt-1">{note}</div>
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
