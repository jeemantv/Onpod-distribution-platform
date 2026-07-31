import { requireAdmin } from "@/lib/session";
import { listJobs } from "@/lib/yt-ai-store";
import { YouTubeAIStudio } from "./_components/YouTubeAIStudio";

export const dynamic = "force-dynamic";

export default async function AIYouTubePage() {
  const user = requireAdmin();
  const jobs = await listJobs(user.id);

  return (
    <>
      <h1 className="display text-[32px] mb-2">AI YouTube</h1>
      <p className="text-text-muted text-[13px] mb-6 max-w-[720px]">
        Drop a public YouTube link and get the whole package: transcript,
        title, description, tags, chapters, articles and thumbnails. Nothing is
        posted anywhere — copy what you want into YouTube yourself.
      </p>
      <YouTubeAIStudio
        initialJobs={jobs.map((j) => ({
          id: j.id,
          videoId: j.videoId,
          url: j.url,
          videoTitle: j.videoTitle,
          channel: j.channel,
          coverUrl: j.coverUrl,
          hasTranscript: !!j.transcript,
          transcriptComplete: j.transcriptComplete,
          hasAI: !!j.ai,
          createdAt: j.createdAt.toISOString(),
        }))}
      />
    </>
  );
}
