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
  // Where this run's transcript came from, and whether the YouTube grant needs
  // re-consent for the captions scope.
  const [source, setSource] = useState("");
  const [needsReconnect, setNeedsReconnect] = useState(false);
  // Set when neither path can read the video, so the UI offers the manual
  // transcript box instead of a dead end.
  const [blocked, setBlocked] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteBusy, setPasteBusy] = useState(false);

  const refreshJobs = useCallback(async () => {
    const res = await fetch("/api/admin/yt-ai/jobs");
    if (res.ok) setJobs(((await res.json()) as { jobs: JobSummary[] }).jobs);
  }, []);

  const refetchJob = useCallback(async (id: string): Promise<Job | null> => {
    const res = await fetch(`/api/admin/yt-ai/${id}`);
    return res.ok ? ((await res.json()) as { job: Job }).job : null;
  }, []);

  const loadJob = useCallback(async (id: string) => {
    setError("");
    setStatus("");
    setThumbNote("");
    setBlocked("");
    setSource("");
    setPasteOpen(false);
    setPasteText("");
    const res = await fetch(`/api/admin/yt-ai/${id}`);
    if (!res.ok) {
      setError("Could not open that run.");
      return;
    }
    setJob(((await res.json()) as { job: Job }).job);
  }, []);

  // Unlisted and private videos can only be read through the owner's YouTube
  // OAuth token, and even for public ones the caption track is far faster than
  // making Gemini watch the whole episode. So: try captions, fall back.
  async function tryCaptions(
    jobId: string,
  ): Promise<{ imported: boolean; message?: string; geminiPossible: boolean }> {
    setStatus("Checking YouTube for a caption track…");
    const res = await fetch("/api/admin/yt-ai/captions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId }),
    });
    const data = (await res.json()) as {
      imported?: boolean;
      source?: string;
      chars?: number;
      privacyStatus?: string;
      geminiPossible?: boolean;
      reason?: string;
      message?: string;
    };
    if (!res.ok) return { imported: false, message: data.message, geminiPossible: true };
    if (data.imported) {
      setSource(
        `${data.source ?? "YouTube captions"}${
          data.privacyStatus ? ` · ${data.privacyStatus} video` : ""
        }`,
      );
      return { imported: true, geminiPossible: false };
    }
    if (data.reason === "reconnect") setNeedsReconnect(true);
    return {
      imported: false,
      message: data.message,
      geminiPossible: data.geminiPossible !== false,
    };
  }

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
    setSource("");
    setNeedsReconnect(false);
    setBlocked("");
    setPasteOpen(false);
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

      const captions = await tryCaptions(data.job.id);
      if (!captions.imported && !captions.geminiPossible) {
        // The video isn't public, so Gemini can't watch it, and there was no
        // caption track to read. Stop here with the real reason instead of
        // letting Gemini return a 403 that explains nothing.
        setJob((await refetchJob(data.job.id)) ?? data.job);
        setBlocked(captions.message ?? "This video can't be read automatically.");
        setStatus("");
        setPasteOpen(true);
        void refreshJobs();
        return;
      }
      if (!captions.imported) {
        setStatus(
          `${captions.message ?? "No caption track."} Falling back to Gemini (public videos only)…`,
        );
      }
      const afterTranscript = captions.imported
        ? await refetchJob(data.job.id)
        : await runTranscript(data.job.id);
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
      let updated: Job | null;
      if (step === "transcript") {
        const captions = await tryCaptions(job.id);
        if (!captions.imported && !captions.geminiPossible) {
          setBlocked(captions.message ?? "This video can't be read automatically.");
          setPasteOpen(true);
          setStatus("");
          return;
        }
        updated = captions.imported ? await refetchJob(job.id) : await runTranscript(job.id, true);
      } else {
        updated = await runMetadata(job.id);
      }
      if (updated) setJob(updated);
      setStatus("Done.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  // Manual transcript, then straight on to the metadata so the run finishes
  // the same way an automatic one would.
  async function handlePaste() {
    if (!job) return;
    setError("");
    setPasteBusy(true);
    try {
      const res = await fetch("/api/admin/yt-ai/paste-transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id, text: pasteText }),
      });
      const data = (await res.json()) as { ok?: boolean; timed?: boolean; message?: string };
      if (!res.ok || !data.ok) throw new Error(data.message || "Couldn't save that transcript.");
      setSource(data.timed ? "a pasted subtitle file" : "a pasted transcript");
      setBlocked("");
      setPasteOpen(false);
      setPasteText("");
      setStatus("Transcript saved. Writing the metadata…");
      const updated = await runMetadata(job.id);
      if (updated) setJob(updated);
      setStatus("Done. Copy what you need into YouTube.");
      void refreshJobs();
    } catch (err) {
      setError((err as Error).message);
      setStatus("");
    } finally {
      setPasteBusy(false);
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
            <strong>Unlisted and private videos work</strong> when they live on a
            YouTube channel you&apos;ve connected — OnPod reads the caption track with
            your own credentials. For anything else the video must be public, because
            the fallback is Gemini watching it as an anonymous viewer.
          </p>
          {status ? <p className="text-[12px] text-info mt-2">{status}</p> : null}
          {source ? <p className="text-[12px] text-success mt-2">Transcript from {source}</p> : null}
          {needsReconnect ? (
            <p className="text-[12px] text-warning mt-2">
              Your YouTube connection was made before OnPod asked for caption access.{" "}
              <a
                href="/api/youtube/connect?returnTo=/admin/yt-ai"
                className="underline font-medium"
              >
                Reconnect the channel
              </a>{" "}
              to read unlisted and private videos.
            </p>
          ) : null}
          {blocked ? <p className="text-[12px] text-warning mt-2">{blocked}</p> : null}
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

            {/* Manual transcript: the way out when the video is unlisted AND
                has no caption track, so neither automatic path can read it. */}
            {!job.transcript || pasteOpen ? (
              <div className="bg-bg-elev border border-border rounded-[16px] p-4 mb-4">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="text-[13px] text-text">Paste a transcript</div>
                  {job.transcript ? (
                    <button
                      onClick={() => setPasteOpen(false)}
                      className="text-[11px] text-text-muted hover:text-text"
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
                <p className="text-[11px] text-text-dim mb-2">
                  Works with an .srt or .vtt from YouTube Studio (Subtitles → download),
                  or any plain text. Subtitle files keep their timings, so chapters stay
                  accurate.
                </p>
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  rows={6}
                  placeholder="00:00:01,000 --> 00:00:04,000&#10;Welcome back to the show…"
                  className="w-full bg-bg-elev-2 border border-border rounded-[10px] px-3 py-2 text-[12px] font-mono text-text placeholder:text-text-dim focus:outline-none focus:border-border-strong"
                />
                <button
                  onClick={() => void handlePaste()}
                  disabled={pasteBusy || pasteText.trim().length < 40}
                  className="mt-2 px-4 py-2 rounded-[10px] bg-brand-gradient text-white text-[13px] font-medium disabled:opacity-40"
                >
                  {pasteBusy ? "Working…" : "Use this transcript"}
                </button>
              </div>
            ) : null}

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
