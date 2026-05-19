import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getShowByUser, upsertShow, type ShowConfig } from "@/lib/podcast-store";

export async function GET() {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const show = await getShowByUser(user.id);
  return NextResponse.json({ show });
}

export async function POST(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json()) as Partial<ShowConfig> & { slug?: string };
  const existing = await getShowByUser(user.id);

  const slug = (body.slug ?? existing?.slug ?? user.id).replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const now = Date.now();

  const config: ShowConfig = {
    userId: user.id,
    slug,
    title: body.title ?? existing?.title ?? `${user.firstName} ${user.lastName} Podcast`,
    description:
      body.description ?? existing?.description ?? "A podcast distributed via OnPod Studios.",
    author: body.author ?? existing?.author ?? `${user.firstName} ${user.lastName}`,
    authorEmail: body.authorEmail ?? existing?.authorEmail ?? user.email,
    language: body.language ?? existing?.language ?? "en",
    categoryItunes: body.categoryItunes ?? existing?.categoryItunes ?? "Business",
    coverUrl: body.coverUrl ?? existing?.coverUrl ?? "",
    link: body.link ?? existing?.link ?? "https://onpod.io",
    explicit: body.explicit ?? existing?.explicit ?? false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await upsertShow(config);
  return NextResponse.json({ show: config });
}
