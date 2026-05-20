"use client";

import { useEffect, useMemo, useState } from "react";

interface Template {
  uid: string;
  name: string;
  preview_url?: string;
  available_modifications?: { name: string; type: string }[];
}

interface FileRow {
  key: string;
  filename: string;
  fileId: string;
}

type Props = {
  files: FileRow[];
  defaultTitle?: string;
};

function isVideo(name: string): boolean {
  return /\.(mp4|mov|webm)$/i.test(name);
}

export function BannerbearGenerator({ files, defaultTitle = "" }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [selectedFileId, setSelectedFileId] = useState<string>("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ url: string } | null>(null);
  const [genError, setGenError] = useState<string | null>(null);

  const videoFiles = useMemo(
    () => files.filter((f) => isVideo(f.filename)),
    [files],
  );

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/ai/bannerbear/templates");
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setLoadError(data.message || `Templates ${res.status}`);
          return;
        }
        const data = await res.json();
        setTemplates(data.templates ?? []);
      } catch (err) {
        setLoadError((err as Error).message);
      }
    })();
  }, []);

  useEffect(() => {
    if (videoFiles.length > 0 && !selectedFileId) {
      setSelectedFileId(videoFiles[0].fileId);
    }
  }, [videoFiles, selectedFileId]);

  const tmpl = templates.find((t) => t.uid === selectedTemplate);

  useEffect(() => {
    if (!tmpl) return;
    const next: Record<string, string> = {};
    for (const m of tmpl.available_modifications ?? []) {
      if (m.type === "text" && /title/i.test(m.name) && defaultTitle) {
        next[m.name] = defaultTitle;
      } else {
        next[m.name] = "";
      }
    }
    setValues(next);
  }, [tmpl, defaultTitle]);

  async function generate() {
    if (!tmpl || !selectedFileId) return;
    setBusy(true);
    setGenError(null);
    setResult(null);
    try {
      const modifications = Object.entries(values)
        .filter(([, v]) => v && v.trim().length > 0)
        .map(([name, v]) => {
          if (/(image|photo|avatar|logo)/i.test(name)) {
            return { name, image_url: v };
          }
          return { name, text: v };
        });
      const res = await fetch("/api/ai/bannerbear/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId: selectedFileId,
          templateId: tmpl.uid,
          modifications,
          slug: tmpl.name,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setGenError(data.message || `Generate failed (${res.status})`);
        setBusy(false);
        return;
      }
      setResult({ url: data.url });
    } catch (err) {
      setGenError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (videoFiles.length === 0) return null;

  return (
    <div className="bg-bg-elev border border-border rounded-[16px] p-4 mb-4">
      <h2 className="text-[14px] font-semibold mb-2">Thumbnail (Bannerbear)</h2>
      <p className="text-[12px] text-text-muted mb-3">
        Pick a Bannerbear template, fill the fields, and we&apos;ll render a
        thumbnail and save it to B2 next to the source file.
      </p>

      {loadError ? (
        <div className="text-[12px] text-danger mb-3">
          {loadError}. Set <code>BANNERBEAR_API_KEY</code> in Vercel and create
          at least one template in your Bannerbear project.
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <label className="text-[11px] text-text-muted">
          Attach to file
          <select
            value={selectedFileId}
            onChange={(e) => setSelectedFileId(e.target.value)}
            className="mt-1 w-full px-3 py-2 bg-bg-elev-2 border border-border rounded-[8px] text-[13px]"
          >
            {videoFiles.map((f) => (
              <option key={f.fileId} value={f.fileId}>
                {f.filename}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-text-muted">
          Template
          <select
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value)}
            className="mt-1 w-full px-3 py-2 bg-bg-elev-2 border border-border rounded-[8px] text-[13px]"
            disabled={templates.length === 0}
          >
            <option value="">— Choose a template —</option>
            {templates.map((t) => (
              <option key={t.uid} value={t.uid}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {tmpl ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {tmpl.preview_url ? (
            <img
              src={tmpl.preview_url}
              alt={tmpl.name}
              className="rounded-[10px] border border-border w-full"
            />
          ) : null}
          <div className="space-y-2">
            {(tmpl.available_modifications ?? []).map((m) => (
              <label key={m.name} className="block text-[11px] text-text-muted">
                {m.name}
                <input
                  type="text"
                  value={values[m.name] ?? ""}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [m.name]: e.target.value }))
                  }
                  placeholder={
                    /(image|photo|avatar|logo)/i.test(m.name)
                      ? "https://… (public image URL)"
                      : m.type
                  }
                  className="mt-1 w-full px-3 py-2 bg-bg-elev-2 border border-border rounded-[8px] text-[13px]"
                />
              </label>
            ))}
            <button
              onClick={generate}
              disabled={busy || !selectedFileId}
              className="mt-2 px-4 py-2 rounded-[10px] bg-accent text-white text-[13px] disabled:opacity-50"
            >
              {busy ? "Rendering…" : "Generate thumbnail"}
            </button>
            {genError ? (
              <p className="text-[12px] text-danger">{genError}</p>
            ) : null}
            {result ? (
              <div className="mt-3">
                <img
                  src={result.url}
                  alt="Generated thumbnail"
                  className="rounded-[10px] border border-border max-w-full"
                />
                <p className="text-[11px] text-text-muted mt-1 break-all">
                  Saved to: {result.url}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
