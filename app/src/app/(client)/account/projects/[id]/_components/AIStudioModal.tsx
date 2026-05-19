"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import type { FileItem, ArticleFormat } from "@/lib/types";
import { ThumbnailGenerator } from "./ThumbnailGenerator";

interface AIData {
  title: string;
  description: string;
  chapters: string;
  tags: string[];
  hashtags: string[];
  summary: string;
  language: string;
  transcript: string;
}

const EMPTY: AIData = {
  title: "",
  description: "",
  chapters: "",
  tags: [],
  hashtags: [],
  summary: "",
  language: "",
  transcript: "",
};

const TABS = ["metadata", "chapters", "articles", "thumbnails", "transcript"] as const;
type TabKey = (typeof TABS)[number];

const ARTICLE_FORMATS: { key: ArticleFormat; label: string }[] = [
  { key: "linkedin", label: "LinkedIn" },
  { key: "wordpress", label: "WordPress" },
  { key: "medium", label: "Medium" },
  { key: "newsletter", label: "Newsletter" },
  { key: "seoBlog", label: "SEO Blog" },
];

export function AIStudioModal({
  fileId,
  file,
  onClose,
}: {
  fileId: string;
  file: FileItem;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<TabKey>("metadata");
  const [data, setData] = useState<AIData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [articleByFormat, setArticleByFormat] = useState<
    Partial<Record<ArticleFormat, string>>
  >({});
  const [activeArticle, setActiveArticle] = useState<ArticleFormat>("linkedin");
  const [generatingArticle, setGeneratingArticle] = useState(false);
  const [articleError, setArticleError] = useState<string | null>(null);
  const [regeneratingField, setRegeneratingField] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/transcribe/${fileId}/status?include=data`,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as {
          status: string;
          transcript?: { transcript: string; language: string };
          ai?: {
            title: string;
            description: string;
            chapters: string;
            tags: string[];
            hashtags: string[];
            summary: string;
            language: string;
          };
        };
        if (cancelled) return;
        if (body.ai || body.transcript) {
          setData({
            title: body.ai?.title ?? "",
            description: body.ai?.description ?? "",
            chapters: body.ai?.chapters ?? "",
            tags: body.ai?.tags ?? [],
            hashtags: body.ai?.hashtags ?? [],
            summary: body.ai?.summary ?? "",
            language: body.ai?.language ?? body.transcript?.language ?? "",
            transcript: body.transcript?.transcript ?? "",
          });
          const existing =
            (body.ai as { articlesJson?: Partial<Record<ArticleFormat, string>> } | undefined)
              ?.articlesJson;
          if (existing) setArticleByFormat(existing);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "load failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  const generateArticleFor = async (format: ArticleFormat) => {
    setGeneratingArticle(true);
    setArticleError(null);
    try {
      const res = await fetch("/api/ai/generate-article", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId, format }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
      }
      const body = (await res.json()) as { markdown: string };
      setArticleByFormat((prev) => ({ ...prev, [format]: body.markdown }));
    } catch (err) {
      setArticleError((err as Error).message);
    } finally {
      setGeneratingArticle(false);
    }
  };

  const persistField = async (
    field: "title" | "description" | "chapters" | "tags" | "hashtags" | "summary",
    value: string | string[],
  ) => {
    try {
      await fetch("/api/ai/save-field", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId, field, value }),
      });
    } catch {
      // ignore — UI state still reflects the change
    }
  };

  const regenerate = async (field: "title" | "description" | "chapters" | "tags" | "hashtags" | "summary", customPrompt?: string) => {
    setRegeneratingField(field);
    try {
      const res = await fetch(`/api/ai/regenerate-section`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId, field, customPrompt }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { value: string | string[] };
      setData((d) => ({ ...d, [field]: body.value }));
    } catch (err) {
      alert("Regenerate failed: " + (err as Error).message);
    } finally {
      setRegeneratingField(null);
    }
  };

  return (
    <Modal title="AI Studio" subtitle={file.name} onClose={onClose} size="xl">
      {loading ? (
        <div className="mb-4 px-3 py-2 rounded-[8px] bg-bg-elev-2 border border-border text-[12px] text-text-muted">
          Loading content…
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 px-3 py-2 rounded-[8px] bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-[12px] text-[#f87171]">
          {error}
        </div>
      ) : null}
      <div className="flex items-center gap-1 mb-6 bg-bg-elev-2 border border-border rounded-[12px] p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-[8px] text-[13px] font-medium capitalize transition ${
              tab === t
                ? "bg-bg-elev-3 text-text"
                : "text-text-muted hover:text-text"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "metadata" ? (
        <div className="space-y-5">
          <Field label="YouTube title (saves automatically)">
            <input
              value={data.title}
              onChange={(e) => setData({ ...data, title: e.target.value })}
              onBlur={() => void persistField("title", data.title)}
              className="input"
            />
            <RegenRow busy={regeneratingField === "title"} onRegenerate={(prompt) => regenerate("title", prompt)} />
          </Field>

          <Field label="YouTube description (saves automatically)">
            <textarea
              value={data.description}
              onChange={(e) =>
                setData({ ...data, description: e.target.value })
              }
              onBlur={() => void persistField("description", data.description)}
              rows={8}
              className="input"
            />
            <RegenRow busy={regeneratingField === "description"} onRegenerate={(prompt) => regenerate("description", prompt)} />
          </Field>

          <Field label={`SEO tags (${data.tags.length})`}>
            <div className="flex flex-wrap gap-2">
              {data.tags.map((t, i) => (
                <Chip
                  key={i}
                  label={t}
                  onRemove={() => {
                    const next = data.tags.filter((_, j) => j !== i);
                    setData({ ...data, tags: next });
                    void persistField("tags", next);
                  }}
                />
              ))}
            </div>
          </Field>

          <Field label={`Hashtags (${data.hashtags.length})`}>
            <div className="flex flex-wrap gap-2">
              {data.hashtags.map((t, i) => (
                <Chip
                  key={i}
                  label={t}
                  onRemove={() => {
                    const next = data.hashtags.filter((_, j) => j !== i);
                    setData({ ...data, hashtags: next });
                    void persistField("hashtags", next);
                  }}
                />
              ))}
            </div>
          </Field>

          <Field label="Summary">
            <textarea
              value={data.summary}
              onChange={(e) => setData({ ...data, summary: e.target.value })}
              onBlur={() => void persistField("summary", data.summary)}
              rows={3}
              className="input"
            />
          </Field>

          <div className="text-[12px] text-text-muted">
            Detected language: <span className="text-text">{data.language}</span>
          </div>
        </div>
      ) : null}

      {tab === "chapters" ? (
        <div>
          <textarea
            value={data.chapters}
            onChange={(e) => setData({ ...data, chapters: e.target.value })}
            onBlur={() => void persistField("chapters", data.chapters)}
            rows={12}
            className="input font-mono text-[13px]"
          />
          <p className="text-[11px] text-text-dim mt-2">
            Format: <code>00:00 Title</code> per line. YouTube auto-detects timestamps after 3+ entries with the first being 00:00. Saves automatically on blur.
          </p>
          <RegenRow busy={regeneratingField === "chapters"} onRegenerate={(prompt) => regenerate("chapters", prompt)} />
        </div>
      ) : null}

      {tab === "articles" ? (
        <div>
          <div className="flex items-center gap-2 mb-5 flex-wrap">
            {ARTICLE_FORMATS.map((f) => (
              <button
                key={f.key}
                onClick={() => setActiveArticle(f.key)}
                className={`px-3 py-1.5 rounded-[8px] border text-[12px] transition ${
                  activeArticle === f.key
                    ? "bg-bg-elev-3 border-border-strong text-text"
                    : "bg-bg-elev-2 border-border text-text-muted hover:text-text"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <textarea
            value={articleByFormat[activeArticle] ?? ""}
            onChange={(e) =>
              setArticleByFormat({
                ...articleByFormat,
                [activeArticle]: e.target.value,
              })
            }
            placeholder={`Click "Generate ${activeArticle}" to create a ${activeArticle} article from the transcript. Costs 1 article credit.`}
            rows={14}
            className="input"
          />
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <button
              onClick={() => generateArticleFor(activeArticle)}
              disabled={generatingArticle || !data.transcript}
              className="btn-primary disabled:opacity-60"
            >
              {generatingArticle ? "Writing…" : articleByFormat[activeArticle] ? `Regenerate ${activeArticle}` : `Generate ${activeArticle}`}
            </button>
            <button
              onClick={() => {
                const txt = articleByFormat[activeArticle] ?? "";
                if (txt) navigator.clipboard.writeText(txt);
              }}
              className="btn-secondary"
              disabled={!articleByFormat[activeArticle]}
            >
              Copy
            </button>
            <button
              onClick={() => {
                const txt = articleByFormat[activeArticle] ?? "";
                if (!txt) return;
                const blob = new Blob([txt], { type: "text/markdown" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${file.name}_${activeArticle}.md`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 500);
              }}
              className="btn-secondary"
              disabled={!articleByFormat[activeArticle]}
            >
              Download .md
            </button>
          </div>
          {articleError ? (
            <div className="mt-3 p-3 rounded-[10px] bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-[12px] text-[#f87171]">
              {articleError}
            </div>
          ) : null}
          {!data.transcript ? (
            <div className="mt-3 p-3 rounded-[10px] bg-[rgba(245,158,11,0.08)] border border-[rgba(245,158,11,0.25)] text-[12px] text-[#fbbf24]">
              Run AI transcription on this file first (purple brain button on the file row).
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === "thumbnails" ? (
        <ThumbnailGenerator fileId={fileId} file={file} aiTitle={data.title} />
      ) : null}

      {tab === "transcript" ? (
        <div>
          <pre className="whitespace-pre-wrap text-[13px] leading-relaxed bg-bg-elev-2 border border-border rounded-lg p-4 max-h-[400px] overflow-y-auto">
            {data.transcript}
          </pre>
          <div className="flex items-center gap-2 mt-3">
            <button className="btn-secondary">Copy</button>
            <button className="btn-secondary">Export SRT</button>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        :global(.input) {
          width: 100%;
          padding: 10px 14px;
          background: #1c1c20;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          color: #fafafa;
          font-family: inherit;
          font-size: 13px;
        }
        :global(.input:focus) {
          outline: none;
          border-color: rgba(255, 255, 255, 0.16);
        }
        :global(.btn-primary) {
          padding: 8px 14px;
          border-radius: 8px;
          background: #ff3b30;
          color: white;
          font-size: 13px;
          font-weight: 500;
        }
        :global(.btn-secondary) {
          padding: 8px 14px;
          border-radius: 8px;
          background: #1c1c20;
          color: #fafafa;
          border: 1px solid rgba(255, 255, 255, 0.08);
          font-size: 13px;
        }
      `}</style>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[12px] text-text-muted mb-2">{label}</label>
      {children}
    </div>
  );
}

function RegenRow({
  busy,
  onRegenerate,
}: {
  busy?: boolean;
  onRegenerate: (customPrompt?: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  return (
    <div className="flex items-center gap-2 mt-2">
      <input
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Custom prompt (e.g. make it more controversial)"
        className="flex-1 px-3 py-2 bg-bg-elev-2 border border-border rounded-[8px] text-[12px]"
      />
      <button
        disabled={busy || !prompt}
        onClick={() => onRegenerate(prompt)}
        className="btn-secondary disabled:opacity-50"
      >
        {busy ? "Working…" : "Improve"}
      </button>
      <button
        disabled={busy}
        onClick={() => onRegenerate(undefined)}
        className="btn-secondary disabled:opacity-50"
      >
        {busy ? "…" : "Regenerate"}
      </button>
    </div>
  );
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-bg-elev-3 border border-border text-[12px]">
      {label}
      <button onClick={onRemove} className="text-text-dim hover:text-text">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </span>
  );
}
