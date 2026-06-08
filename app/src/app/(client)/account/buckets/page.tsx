import { TopNav } from "@/components/TopNav";
import { requireSession } from "@/lib/session";
import { BucketsManager } from "./BucketsManager";

export const dynamic = "force-dynamic";

// Auto-post: SocialBee-style rotating buckets that publish clips to YouTube on
// a repeating schedule.
export default async function BucketsPage() {
  const user = requireSession();
  return (
    <>
      <TopNav user={user} backHref="/account" backLabel="All folders" />
      <main className="max-w-[1000px] mx-auto px-4 sm:px-8 py-8 pb-32">
        <h1 className="display text-[32px] sm:text-[40px] tracking-wide mb-1">Auto-post</h1>
        <p className="text-text-muted text-[13px] mb-7">
          Drop clips into a bucket and set a schedule. They post to YouTube on
          repeat — when the last one posts, it loops back to the first.
        </p>
        <BucketsManager />
      </main>
    </>
  );
}
