import Link from "next/link";
import { notFound } from "next/navigation";
import { TopNav } from "@/components/TopNav";
import { requireClient } from "@/lib/session";
import { listSessionFiles } from "@/lib/studio-store";
import {
  STUDIO_LABEL,
  STUDIO_SLUGS,
  parseSessionFolder,
  sessionBelongsToEmail,
  type StudioSlug,
} from "@/lib/studio";
import { encodeFileId } from "@/lib/b2";
import { SessionAITools } from "@/components/SessionAITools";
import { AIMetadataPanel } from "@/components/AIMetadataPanel";
import { OpusClipPanel } from "@/components/OpusClipPanel";
import { BannerbearGenerator } from "@/components/BannerbearGenerator";

export const dynamic = "force-dynamic";

function fmt(n: number): string {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export default async function ClientSessionPage({
  params,
}: {
  params: { studio: string; folder: string };
}) {
  const user = requireClient();
  if (!STUDIO_SLUGS.includes(params.studio as StudioSlug)) notFound();
  const studio = params.studio as StudioSlug;
  const folder = decodeURIComponent(params.folder);

  if (!sessionBelongsToEmail(folder, user.email) && user.role !== "admin") {
    notFound();
  }
  const parsed = parseSessionFolder(folder);
  const files = await listSessionFiles(studio, "clients", folder);

  return (
    <>
      <TopNav user={user} />
      <main className="max-w-[1280px] mx-auto px-4 sm:px-8 py-6 sm:py-10">
        <div className="mb-2 text-[12px] text-text-muted">
          <Link href="/account" className="hover:text-text underline">
            Your sessions
          </Link>{" "}
          /{" "}
          <span className="text-text">
            {parsed ? `${parsed.date} ${parsed.time}` : folder}
          </span>
        </div>
        <h1 className="display text-[28px] sm:text-[32px] mb-1">
          {parsed ? `${parsed.date} ${parsed.time}` : folder}
        </h1>
        <p className="text-text-muted text-[13px] mb-6">
          {STUDIO_LABEL[studio]} studio · {files.length} files
        </p>

        {(() => {
          const rows = files.map((f) => ({
            key: f.key,
            filename: f.filename,
            fileId: encodeFileId(f.key),
          }));
          return (
            <>
              <SessionAITools files={rows} />
              <AIMetadataPanel files={rows} />
              <BannerbearGenerator
                files={rows}
                defaultTitle={parsed ? `${parsed.date} session` : folder}
              />
              <OpusClipPanel files={rows} />
            </>
          );
        })()}

        {files.length === 0 ? (
          <p className="text-text-muted text-[13px]">
            No files in this session yet.
          </p>
        ) : (
          <div className="bg-bg-elev border border-border rounded-[16px] overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-text-muted text-[11px] uppercase tracking-wider border-b border-border">
                  <th className="text-left p-4 font-medium">File</th>
                  <th className="text-left p-4 font-medium">Size</th>
                  <th className="text-left p-4 font-medium">Uploaded</th>
                  <th className="text-right p-4 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr
                    key={f.key}
                    className="border-b border-border last:border-0 hover:bg-bg-elev-2"
                  >
                    <td className="p-4 font-mono text-[12px]">{f.filename}</td>
                    <td className="p-4 text-text-muted">{fmt(f.sizeBytes)}</td>
                    <td className="p-4 text-text-muted">
                      {f.lastModified
                        ? new Date(f.lastModified).toLocaleString()
                        : "—"}
                    </td>
                    <td className="p-4 text-right">
                      <a
                        href={f.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block px-3 py-1.5 rounded-[8px] bg-accent text-white text-[12px]"
                      >
                        Download
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
