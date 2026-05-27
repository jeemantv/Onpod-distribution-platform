import { TopNav } from "@/components/TopNav";
import { requireSession } from "@/lib/session";
import { getShowByUser } from "@/lib/podcast-store";
import { PodcastSettingsForm } from "@/components/PodcastSettingsForm";
import { BuzzsproutConnectionCard } from "@/components/BuzzsproutConnectionCard";

export const dynamic = "force-dynamic";

export default async function PodcastSettingsPage() {
  const user = requireSession();
  const show = await getShowByUser(user.id);
  return (
    <>
      <TopNav user={user} backHref="/account" backLabel="Back" />
      <main className="max-w-[760px] mx-auto px-4 sm:px-8 py-6 sm:py-10">
        <div className="mb-6">
          <h1 className="display text-[28px] sm:text-[32px]">Podcast settings</h1>
          <p className="text-text-muted text-[13px] mt-1">
            These fields appear in your podcast on Spotify, Apple Podcasts,
            and every other directory.
          </p>
        </div>

        <div className="mb-8">
          <BuzzsproutConnectionCard />
        </div>

        <PodcastSettingsForm
          initial={show}
          defaultAuthor={`${user.firstName} ${user.lastName}`}
          defaultEmail={user.email}
        />
      </main>
    </>
  );
}
