"use client";

import { useCallback, useState } from "react";

interface AIPackage {
  title: string;
  description: string;
  tags: string[];
  hashtags: string[];
  language: string;
  chapters: string;
  summary: string;
}

interface Job {
  id: string;
  videoId: string;
  url: string;
  videoTitle: string | null;
  channel: string | null;
  coverUrl: string | null;
  transcript?: string | null;
  segmentsDone?: number;
  transcriptComplete: boolean;
  ai?: AIPackage | null;
  articles?: Record<string, string> | null;
  thumbnails?: Thumbnail[] | null;
  createdAt: string;
}

interface JobSummary {
  id: string;
  videoId: string;
  url: string;
  videoTitle: string | null;
  channel: string | null;
  coverUrl: string | null;
  hasTranscript: boolean;
  transcriptComplete: boolean;
  hasAI: boolean;
  createdAt: string;
}

interface Thumbnail {
  url: string;
  headline: string;
  reason: string;
  style: string;
  designed: boolean;
}

const ARTICLE_FORMATS = [
  { key: "linkedin", label: "LinkedIn post" },
  { key: "wordpress", label: "WordPress article" },
  { key: "newsletter", label: "Newsletter" },
  { key: "seoBlog", label: "SEO blog post" },
] as const;

type ArticleKey = (typeof ARTICLE_FORMATS)[number]["key"];

export function YouTubeAIStudio({ initialJobs }: { initialJobs: JobSummary[] }) {
  const [url, setUrl] = useState("");
  const [jobs, setJobs] = useState<JobSummary[]>(initialJobs);
  const [job, setJob] = useState<Job | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [busyArticle, setBusyArticle] = useState<ArticleKey | null>(null);
  const [thumbBusy, setThumbBusy] = useState(false);
  const [thumbNote, setThumbNote] = useState("");
  const [stylePrompt, setStylePrompt] = useState("");

  const refreshJobs = useCallback(async () => {
    const res = await fetch("/api/admin/yt-ai/jobs");
    if (res.ok) setJobs(((await res.json()) as { jobs: JobSummary[] }).jobs);
  }, []);

  const loadJob = useCallback(async (id: string) => {
    setError("");
    setStatus("");
    setThumbNote("");
    const res = await fetch(`/api/admin/yt-ai/${id}`);
    if (!res.ok) {
      setError("Could not open that run.");
      return;
    }
    setJob(((await res.json()) as { job: Job }).job);
  }, []);

  // Transcript runs one 20-minute window per request so a long episode never
  // trips the function timeout — loop until the server says it hit the end.
  async function runTranscript(jobId: string, restart = false): Promise<Job | null> {
    let attempt = 0;
    for (;;) {
      const res = await fetch("/api/admin/yt-ai/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, restart: restart && attempt === 0 }),
      });
      const data = (await res.json()) as {
        complete?: boolean;
        minutesDone?: number;
        chars?: number;
        message?: string;
      };
      if (!res.ok) throw new Error(data.message || "Transcription failed.");
      attempt++;
      setStatus(
        data.complete
          ? "Transcript done. Writing the metadata…"
          : `Transcribing… ${data.minutesDone ?? 0} min of video so far`,
      );
      if (data.complete) break;
      if (attempt > 20) break; // hard stop; server caps at 4 hours anyway
    }
    const res = await fetch(`/api/admin/yt-ai/${jobId}`);
    return res.ok ? ((await res.json()) as { job: Job }).job : null;
  }

  async function runMetadata(jobId: string): Promise<Job | null> {
    const res = await fetch("/api/admin/yt-ai/metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId }),
    });
    const data = (await res.json()) as { ai?: AIPackage; message?: string };
    if (!res.ok) throw new Error(data.message || "Metadata generation failed.");
    const fresh = await fetch(`/api/admin/yt-ai/${jobId}`);
    return fresh.ok ? ((await fresh.json()) as { job: Job }).job : null;
  }

  async function handleGenerate() {
    setError("");
    setThumbNote("");
    setRunning(true);
    setStatus("Opening the video…");
    try {
      const res = await fetch("/api/admin/yt-ai/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await res.json()) as { job?: Job; message?: string };
      if (!res.ok || !data.job) throw new Error(data.message || "That link didn't work.");
      setJob(data.job);
      void refreshJobs();

      const afterTranscript = await runTranscript(data.job.id);
      if (afterTranscript) setJob(afterTranscript);

      const afterMeta = await runMetadata(data.job.id);
      if (afterMeta) setJob(afterMeta);
      setStatus("Done. Copy what you need into YouTube.");
      setUrl("");
      void refreshJobs();
    } catch (err) {
      setError((err as Error).message);
      setStatus("");
    } finally {
      setRunning(false);
    }
  }

  async function retryStep(step: "transcript" | "metadata") {
    if (!job) return;
    setError("");
    setRunning(true);
    try {
      const updated =
        step === "transcript" ? await runTranscript(job.id, true) : await runMetadata(job.id);
      if (updated) setJob(updated);
      setStatus("Done.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  async function handleArticle(format: ArticleKey) {
    if (!job) return;
    setError("");
    setBusyArticle(format);
    try {
      const res = await fetch("/api/admin/yt-ai/article", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id, format }),
      });
      const data = (await res.json()) as { markdown?: string; message?: string };
      if (!res.ok || data.markdown === undefined) {
        throw new Error(data.message || "Article generation failed.");
      }
      setJob({ ...job, articles: { ...(job.articles ?? {}), [format]: data.markdown } });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyArticle(null);
    }
  }

  async function handleThumbnails(redo = false) {
    if (!job) return;
    setError("");
    setThumbNote("");
    setThumbBusy(true);
    try {
      const res = await fetch("/api/admin/yt-ai/thumbnails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id, stylePrompt, redo }),
      });
      const data = (await res.json()) as {
        thumbnails?: Thumbnail[];
        note?: string;
        message?: string;
      };
      if (!res.ok || !data.thumbnails) throw new Error(data.message || "Thumbnail design failed.");
      setJob({ ...job, thumbnails: data.thumbnails });
      if (data.note) setThumbNote(data.note);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setThumbBusy(false);
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/admin/yt-ai/${id}`, { method: "DELETE" });
    if (job?.id === id) setJob(null);
    void refreshJobs();
  }

  const ai = job?.ai ?? null;

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
      <div className="flex-1 min-w-0 w-full">
        {/* Input */}
        <div className="bg-bg-elev border border-border rounded-[16px] p-4 mb-4">
          <label className="block text-[12px] text-text-muted mb-2">YouTube link</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && url.trim() && !running) void handleGenerate();
              }}
              placeholder="https://www.youtube.com/watch?v=…"
              className="flex-1 bg-bg-elev-2 border border-border rounded-[10px] px-3 py-2.5 text-[13px] text-text placeholder:text-text-dim focus:outline-none focus:border-border-strong"
            />
            <button
              onClick={() => void handleGenerate()}
              disabled={running || !url.trim()}
              className="px-5 py-2.5 rounded-[10px] bg-brand-gradient text-white text-[13px] font-medium disabled:opacity-40 whitespace-nowrap"
            >
              {running ? "Working…" : "Generate"}
            </button>
          </div>
          <p className="text-[11px] text-text-dim mt-2">
            The video has to be public — Gemini watches it on YouTube to build the
            transcript. A one-hour episode takes a few minutes.
          </p>
          {status ? <p className="text-[12px] text-info mt-2">{status}</p> : null}
          {error ? <p className="text-[12px] text-danger mt-2">{error}</p> : null}
        </div>

        {job ? (
          <>
            {/* Video header */}
            <div className="bg-bg-elev border border-border rounded-[16px] p-4 mb-4 flex gap-4 items-start">
              {job.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={job.coverUrl}
                  alt=""
                  className="w-[160px] aspect-video object-cover rounded-[10px] border border-border shrink-0"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="text-[14px] text-text truncate">
                  {job.videoTitle || job.videoId}
                </div>
                <div className="text-[12px] text-text-muted truncate">{job.channel}</div>
                <a
                  href={job.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[12px] text-info hover:underline"
                >
                  Open on YouTube ↗
                </a>
                <div className="text-[11px] text-text-dim mt-1">
                  {job.transcript
                    ? `${job.transcript.length.toLocaleString()} characters of transcript${
                        job.transcriptComplete ? "" : " (partial)"
                      }`
                    : "No transcript yet"}
                </div>
              </div>
            </div>

            {ai ? (
              <>
                <Field label="Title" value={ai.title} />
                <Field label="Description" value={ai.description} multiline />
                <Field label="Chapters" value={ai.chapters} multiline mono />
                <Field label="Tags" value={ai.tags.join(", ")} multiline />
                <Field label="Hashtags" value={ai.hashtags.join(" ")} multiline />
                <Field label="Summary" value={ai.summary} multiline />
              </>
            ) : job.transcript ? (
              <div className="bg-bg-elev border border-border rounded-[16px] p-4 mb-4">
                <button
                  onClick={() => void retryStep("metadata")}
                  disabled={running}
                  className="px-4 py-2 rounded-[10px] bg-bg-elev-2 border border-border hover:border-border-strong text-[13px] disabled:opacity-40"
                >
                  Generate metadata
                </button>
              </div>
            ) : null}

            {/* Thumbnails */}
            <div className="bg-bg-elev border border-border rounded-[16px] p-4 mb-4">
              <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                <div className="text-[13px] text-text">Thumbnails</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    value={stylePrompt}
                    onChange={(e) => setStylePrompt(e.target.value)}
                    placeholder="optional: red title at the bottom"
                    className="bg-bg-elev-2 border border-border rounded-[8px] px-2.5 py-1.5 text-[12px] w-[220px] placeholder:text-text-dim focus:outline-none focus:border-border-strong"
                  />
                  <button
                    onClick={() => void handleThumbnails(!!job.thumbnails?.length)}
                    disabled={thumbBusy || !job.transcript}
                    className="px-3 py-1.5 rounded-[8px] bg-bg-elev-2 border border-border hover:border-border-strong text-[12px] disabled:opacity-40"
                  >
                    {thumbBusy
                      ? "Designing…"
                      : job.thumbnails?.length
                        ? "Redo"
                        : "Design 3 thumbnails"}
                  </button>
                </div>
              </div>
              {thumbNote ? <p className="text-[11px] text-warning mb-2">{thumbNote}</p> : null}
              {job.thumbnails?.length ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {job.thumbnails.map((t) => (
                    <div key={t.url} className="min-w-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={t.url}
                        alt={t.headline}
                        className="w-full aspect-video object-cover rounded-[10px] border border-border"
                      />
                      <div className="text-[12px] text-text mt-1.5 truncate">{t.headline}</div>
                      <div className="text-[11px] text-text-dim">{t.style}</div>
                      <a
                        href={t.url}
                        download
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-info hover:underline"
                      >
                        Download
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[12px] text-text-dim">
                  Built from the video&apos;s YouTube cover image with a headline pulled
                  from the transcript.
                </p>
              )}
            </div>

            {/* Articles */}
            <div className="bg-bg-elev border border-border rounded-[16px] p-4 mb-4">
              <div className="text-[13px] text-text mb-3">Articles</div>
              <div className="flex flex-wrap gap-2 mb-3">
                {ARTICLE_FORMATS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => void handleArticle(f.key)}
                    disabled={!ai || busyArticle !== null}
                    className="px-3 py-1.5 rounded-[8px] bg-bg-elev-2 border border-border hover:border-border-strong text-[12px] disabled:opacity-40"
                  >
                    {busyArticle === f.key
                      ? "Writing…"
                      : job.articles?.[f.key]
                        ? `Redo ${f.label}`
                        : f.label}
                  </button>
                ))}
              </div>
              {ARTICLE_FORMATS.filter((f) => job.articles?.[f.key]).map((f) => (
                <Field
                  key={f.key}
                  label={f.label}
                  value={job.articles?.[f.key] ?? ""}
                  multiline
                  bare
                />
              ))}
              {!ai ? (
                <p className="text-[12px] text-text-dim">Generate the metadata first.</p>
              ) : null}
            </div>

            {/* Transcript */}
            {job.transcript ? (
              <Field
                label="Transcript"
                value={job.transcript}
                multiline
                mono
                collapsible
                extra={
                  <button
                    onClick={() => void retryStep("transcript")}
                    disabled={running}
                    className="text-[11px] text-text-muted hover:text-text disabled:opacity-40"
                  >
                    Re-transcribe
                  </button>
                }
              />
            ) : null}
          </>
        ) : null}
      </div>

      {/* Recent runs */}
      <aside className="w-full lg:w-[260px] shrink-0">
        <div className="text-[12px] text-text-muted mb-2">Recent</div>
        <div className="flex flex-col gap-1.5">
          {jobs.length === 0 ? (
            <p className="text-[12px] text-text-dim">Nothing yet.</p>
          ) : null}
          {jobs.map((j) => (
            <div
              key={j.id}
              className={`group flex items-center gap-2 p-2 rounded-[10px] border text-left ${
                job?.id === j.id
                  ? "border-border-strong bg-bg-elev-2"
                  : "border-border bg-bg-elev hover:border-border-strong"
              }`}
            >
              <button onClick={() => void loadJob(j.id)} className="flex items-center gap-2 min-w-0 flex-1 text-left">
                {j.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={j.coverUrl} alt="" className="w-[56px] aspect-video object-cover rounded-[6px] shrink-0" />
                ) : null}
                <span className="min-w-0">
                  <span className="block text-[12px] text-text truncate">
                    {j.videoTitle || j.videoId}
                  </span>
                  <span className="block text-[11px] text-text-dim truncate">
                    {j.hasAI ? "Ready" : j.hasTranscript ? "Transcript only" : "Started"}
                  </span>
                </span>
              </button>
              <button
                onClick={() => void handleDelete(j.id)}
                aria-label="Delete run"
                className="opacity-0 group-hover:opacity-100 text-text-dim hover:text-danger text-[14px] px-1"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

function Field({
  label,
  value,
  multiline,
  mono,
  bare,
  collapsible,
  extra,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  mono?: boolean;
  bare?: boolean;
  collapsible?: boolean;
  extra?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(!collapsible);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  const wrapper = bare
    ? "mb-3"
    : "bg-bg-elev border border-border rounded-[16px] p-4 mb-4";

  return (
    <div className={wrapper}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="text-[13px] text-text">{label}</div>
        <div className="flex items-center gap-3">
          {extra}
          {collapsible ? (
            <button
              onClick={() => setOpen((o) => !o)}
              className="text-[11px] text-text-muted hover:text-text"
            >
              {open ? "Hide" : "Show"}
            </button>
          ) : null}
          <button
            onClick={() => void copy()}
            className="text-[11px] text-text-muted hover:text-text"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      {open ? (
        multiline ? (
          <pre
            className={`whitespace-pre-wrap break-words text-[12px] text-text-muted bg-bg-elev-2 border border-border rounded-[10px] p-3 max-h-[320px] overflow-auto ${
              mono ? "font-mono" : ""
            }`}
          >
            {value}
          </pre>
        ) : (
          <div className="text-[13px] text-text bg-bg-elev-2 border border-border rounded-[10px] p-3 break-words">
            {value}
          </div>
        )
      ) : null}
    </div>
  );
}
