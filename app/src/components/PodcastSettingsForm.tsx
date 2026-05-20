"use client";

import { useEffect, useMemo, useState } from "react";

interface ShowConfig {
  slug: string;
  title: string;
  description: string;
  author: string;
  authorEmail: string;
  language: string;
  categoryItunes: string;
  coverUrl: string;
  link: string;
  explicit: boolean;
}

const APPLE_CATEGORIES = [
  "Arts",
  "Business",
  "Comedy",
  "Education",
  "Fiction",
  "Government",
  "Health & Fitness",
  "History",
  "Kids & Family",
  "Leisure",
  "Music",
  "News",
  "Religion & Spirituality",
  "Science",
  "Society & Culture",
  "Sports",
  "Technology",
  "True Crime",
  "TV & Film",
];

export function PodcastSettingsForm({
  initial,
  defaultAuthor,
  defaultEmail,
  email,
}: {
  initial: ShowConfig | null;
  defaultAuthor: string;
  defaultEmail: string;
  email?: string;
}) {
  const [form, setForm] = useState<ShowConfig>(() => ({
    slug: initial?.slug ?? "",
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    author: initial?.author ?? defaultAuthor,
    authorEmail: initial?.authorEmail ?? defaultEmail,
    language: initial?.language ?? "en",
    categoryItunes: initial?.categoryItunes ?? "Business",
    coverUrl: initial?.coverUrl ?? "",
    link: initial?.link ?? "https://onpod.io",
    explicit: initial?.explicit ?? false,
  }));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const feedPath = useMemo(
    () => (form.slug ? `/feeds/${form.slug}.xml` : ""),
    [form.slug],
  );
  const [feedUrl, setFeedUrl] = useState("");
  useEffect(() => {
    if (typeof window !== "undefined" && feedPath) {
      setFeedUrl(new URL(feedPath, window.location.origin).toString());
    }
  }, [feedPath]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const qs = email ? `?email=${encodeURIComponent(email)}` : "";
      const res = await fetch(`/api/rss/show${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || `Save failed (${res.status})`);
        return;
      }
      setSaved(true);
      if (data.show) {
        setForm((prev) => ({ ...prev, slug: data.show.slug }));
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function field<K extends keyof ShowConfig>(key: K, value: ShowConfig[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function copyFeed() {
    if (!feedUrl) return;
    try {
      await navigator.clipboard.writeText(feedUrl);
    } catch {
      /* ignore */
    }
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <Field label="Show title" required>
        <input
          required
          value={form.title}
          onChange={(e) => field("title", e.target.value)}
          placeholder="Founders Unfiltered"
          className="input"
        />
      </Field>

      <Field label="Description">
        <textarea
          rows={4}
          value={form.description}
          onChange={(e) => field("description", e.target.value)}
          placeholder="What your show is about — appears under the title in every podcast app."
          className="input"
        />
      </Field>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Host name">
          <input
            value={form.author}
            onChange={(e) => field("author", e.target.value)}
            className="input"
          />
        </Field>
        <Field label="Owner email (private to directories)">
          <input
            type="email"
            value={form.authorEmail}
            onChange={(e) => field("authorEmail", e.target.value)}
            className="input"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Apple Podcasts category">
          <select
            value={form.categoryItunes}
            onChange={(e) => field("categoryItunes", e.target.value)}
            className="input"
          >
            {APPLE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Language">
          <select
            value={form.language}
            onChange={(e) => field("language", e.target.value)}
            className="input"
          >
            <option value="en">English</option>
            <option value="fr">French</option>
            <option value="es">Spanish</option>
            <option value="pt">Portuguese</option>
            <option value="de">German</option>
            <option value="it">Italian</option>
          </select>
        </Field>
      </div>

      <Field label="Cover art URL (3000×3000 JPG/PNG, public URL)">
        <input
          type="url"
          value={form.coverUrl}
          onChange={(e) => field("coverUrl", e.target.value)}
          placeholder="https://… (we can host it for you — paste the B2 URL of your cover)"
          className="input"
        />
        {form.coverUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={form.coverUrl}
            alt="Cover preview"
            className="mt-3 w-32 h-32 object-cover rounded-[10px] border border-border"
          />
        ) : null}
      </Field>

      <Field label="Website URL">
        <input
          type="url"
          value={form.link}
          onChange={(e) => field("link", e.target.value)}
          className="input"
        />
      </Field>

      <label className="flex items-center gap-2 text-[13px] text-text-muted">
        <input
          type="checkbox"
          checked={form.explicit}
          onChange={(e) => field("explicit", e.target.checked)}
        />
        Mark show as explicit content
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="px-4 py-2 rounded-[10px] bg-accent text-white text-[13px] disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        {saved ? (
          <span className="text-[12px] text-success">Saved ✓</span>
        ) : null}
        {error ? <span className="text-[12px] text-danger">{error}</span> : null}
      </div>

      {feedUrl ? (
        <div className="mt-6 p-4 bg-bg-elev border border-border rounded-[10px]">
          <div className="text-[11px] text-text-muted mb-1">
            Your podcast feed URL (submit this once to each directory):
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all text-[12px] bg-bg border border-border rounded-[6px] px-2 py-1.5 font-mono">
              {feedUrl}
            </code>
            <button
              type="button"
              onClick={copyFeed}
              className="px-3 py-1.5 rounded-[8px] bg-accent text-white text-[12px]"
            >
              Copy
            </button>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .input {
          width: 100%;
          padding: 10px 12px;
          background: var(--bg-elev-2, rgba(255, 255, 255, 0.04));
          border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
          border-radius: 10px;
          font-size: 13px;
          color: inherit;
        }
        .input:focus {
          outline: none;
          border-color: rgba(255, 255, 255, 0.25);
        }
        textarea.input {
          font-family: inherit;
          resize: vertical;
        }
      `}</style>
    </form>
  );
}

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] text-text-muted mb-1">
        {label} {required ? <span className="text-danger">*</span> : null}
      </span>
      {children}
    </label>
  );
}
