"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import type { FileItem, ArticleFormat } from "@/lib/types";

const SAMPLE = {
  title:
    "Why most founders never escape the grind (and what the 1% do differently)",
  description:
    "Three seven-figure Canadian founders pull no punches on the mistakes they wish they'd avoided.\n\nWe cover:\n- The single biggest hiring mistake first-time founders make\n- Why your 'product-market fit' is probably a mirage\n- How to know when to fundraise versus bootstrap\n- A surprisingly simple test for whether your business is actually scalable",
  chapters:
    "00:00 Intro and guest introductions\n02:15 The biggest hiring mistake\n10:42 PMF as a moving target\n22:08 Fundraise vs bootstrap\n34:21 The scalability test\n45:50 Founder mental health",
  tags: [
    "founders","startup","entrepreneurship","bootstrapping","venture capital",
    "hiring","product market fit","scaling","Canadian startups","Montreal tech",
    "podcast","business advice","seven figures","founder mistakes",
  ],
  hashtags: ["#founders","#startup","#entrepreneurship","#bootstrap","#vc","#scaling","#productmarketfit","#canadianbusiness"],
  summary: "Three seven-figure founders share the mistakes that almost broke them.",
  language: "English",
  transcript:
    "[00:00] Welcome to Founders Lounge. Today we're talking with three founders who have built seven-figure businesses in Canada. Let's start with the biggest mistake you ever made…",
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
  const [data, setData] = useState(SAMPLE);
  const [articleByFormat, setArticleByFormat] = useState<
    Partial<Record<ArticleFormat, string>>
  >({});
  const [activeArticle, setActiveArticle] = useState<ArticleFormat>("linkedin");

  void fileId;

  const regenerate = (field: keyof typeof SAMPLE) => {
    setData((d) => ({ ...d }));
    void field;
  };

  return (
    <Modal title="AI Studio" subtitle={file.name} onClose={onClose} size="xl">
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
          <Field label="YouTube title">
            <input
              value={data.title}
              onChange={(e) => setData({ ...data, title: e.target.value })}
              className="input"
            />
            <RegenRow onRegenerate={() => regenerate("title")} />
          </Field>

          <Field label="YouTube description">
            <textarea
              value={data.description}
              onChange={(e) =>
                setData({ ...data, description: e.target.value })
              }
              rows={8}
              className="input"
            />
            <RegenRow onRegenerate={() => regenerate("description")} />
          </Field>

          <Field label={`SEO tags (${data.tags.length})`}>
            <div className="flex flex-wrap gap-2">
              {data.tags.map((t, i) => (
                <Chip
                  key={i}
                  label={t}
                  onRemove={() =>
                    setData({
                      ...data,
                      tags: data.tags.filter((_, j) => j !== i),
                    })
                  }
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
                  onRemove={() =>
                    setData({
                      ...data,
                      hashtags: data.hashtags.filter((_, j) => j !== i),
                    })
                  }
                />
              ))}
            </div>
          </Field>

          <Field label="Summary">
            <textarea
              value={data.summary}
              onChange={(e) => setData({ ...data, summary: e.target.value })}
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
            rows={12}
            className="input font-mono text-[13px]"
          />
          <p className="text-[11px] text-text-dim mt-2">
            Format: <code>00:00 Title</code> per line. YouTube auto-detects timestamps after 3+ entries with the first being 00:00.
          </p>
          <RegenRow onRegenerate={() => regenerate("chapters")} />
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
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() =>
                setArticleByFormat({
                  ...articleByFormat,
                  [activeArticle]: `# Sample ${activeArticle} article\n\nThis is a mock article. In production this is generated by Claude Sonnet 4 from the transcript with a format-specific tone guide.`,
                })
              }
              className="btn-primary"
            >
              Generate {activeArticle}
            </button>
            <button className="btn-secondary">Copy</button>
            <button className="btn-secondary">Download .md</button>
          </div>
        </div>
      ) : null}

      {tab === "thumbnails" ? (
        <div>
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="aspect-video rounded-lg bg-gradient-to-br from-[#a855f7] to-[#ec4899] border border-border-strong flex items-center justify-center display text-[20px] text-white/80"
              >
                Variant {i}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-4">
            <button className="btn-primary">Generate new variants</button>
            <button className="btn-secondary">Extract from video</button>
            <button className="btn-secondary">Upload custom</button>
          </div>
        </div>
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

function RegenRow({ onRegenerate }: { onRegenerate: () => void }) {
  return (
    <div className="flex items-center gap-2 mt-2">
      <input
        placeholder="Custom prompt (e.g. make it more controversial)"
        className="flex-1 px-3 py-2 bg-bg-elev-2 border border-border rounded-[8px] text-[12px]"
      />
      <button className="btn-secondary">Improve</button>
      <button onClick={onRegenerate} className="btn-secondary">
        Regenerate
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
