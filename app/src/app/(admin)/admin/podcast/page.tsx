import Link from "next/link";
import { redirect } from "next/navigation";
import { requireEditorOrAdmin } from "@/lib/session";
import { getShowByUser } from "@/lib/podcast-store";
import { getUserByEmail as getStoredUserByEmail } from "@/lib/auth-store";
import { getUserByEmail as getMockUserByEmail } from "@/lib/mock-data";
import { PodcastSettingsForm } from "@/components/PodcastSettingsForm";

export const dynamic = "force-dynamic";

async function resolveOwner(emailRaw: string) {
  const email = emailRaw.toLowerCase();
  const stored = await getStoredUserByEmail(email);
  if (stored) {
    return {
      id: stored.id,
      email: stored.email,
      firstName: stored.firstName,
      lastName: stored.lastName,
    };
  }
  const mock = getMockUserByEmail(email);
  if (mock) {
    return {
      id: mock.id,
      email: mock.email,
      firstName: mock.firstName,
      lastName: mock.lastName,
    };
  }
  const id = `email-${email.replace(/[^a-z0-9]+/gi, "-")}`;
  const [first, ...rest] = email.split("@")[0].split(".");
  return {
    id,
    email,
    firstName: first || "Podcast",
    lastName: rest.join(" ") || "Host",
  };
}

export default async function AdminPodcastPage({
  searchParams,
}: {
  searchParams: { email?: string };
}) {
  requireEditorOrAdmin();
  const email = searchParams.email?.toLowerCase();
  if (!email) {
    redirect("/admin/clients");
  }
  const owner = await resolveOwner(email);
  const show = await getShowByUser(owner.id);

  return (
    <>
      <div className="mb-2 text-[12px] text-text-muted">
        <Link href="/admin/clients" className="hover:text-text underline">
          Clients
        </Link>{" "}
        / <span className="text-text">Podcast settings</span>
      </div>
      <h1 className="display text-[28px] mb-1">
        Podcast for {owner.firstName} {owner.lastName}
      </h1>
      <p className="text-text-muted text-[13px] mb-6">{owner.email}</p>

      <PodcastSettingsForm
        initial={show}
        defaultAuthor={`${owner.firstName} ${owner.lastName}`}
        defaultEmail={owner.email}
        email={email}
      />
    </>
  );
}
