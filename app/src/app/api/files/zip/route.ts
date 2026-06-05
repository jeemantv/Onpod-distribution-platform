// Bundle multiple files into a single .zip and STREAM it back. Used by the
// bulk "Download" button — browsers block rapid programmatic multi-downloads,
// so one named archive is much friendlier.
//
// Why streaming (archiver) instead of buffering (JSZip): JSZip holds every
// source file AND the finished archive in memory before emitting a single
// buffer. A 40-clip batch is multiple GB → the function OOMs (500), and even
// short of OOM, Vercel caps a buffered response body. archiver pipes each
// clip from B2 straight into the zip output with ~constant memory, and a
// streamed response has no size cap.

import archiver from "archiver";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { decodeFileId, getDownloadUrl } from "@/lib/b2";
import { canAccessKey } from "@/lib/access";

export const runtime = "nodejs";
export const maxDuration = 300;
// Streaming response — don't let the platform try to buffer/cache it.
export const dynamic = "force-dynamic";

interface Body {
  fileIds: string[];
  name?: string;
}

export async function POST(req: Request) {
  const user = getSession();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.fileIds?.length) {
    return NextResponse.json({ error: "missing_fileIds" }, { status: 400 });
  }

  // Decode + auth every key up front so a bad ID fails fast with a proper
  // status code — once we start streaming the archive the status is already
  // committed to 200.
  const entries: { key: string; filename: string }[] = [];
  for (const fileId of body.fileIds) {
    let key: string;
    try {
      key = decodeFileId(fileId);
    } catch {
      return NextResponse.json({ error: "invalid_file_id", fileId }, { status: 400 });
    }
    if (!canAccessKey(user, key)) {
      return NextResponse.json({ error: "forbidden", fileId }, { status: 403 });
    }
    entries.push({ key, filename: key.split("/").pop() ?? "file" });
  }

  // Deduplicate names so two files with the same basename don't clobber each
  // other in the archive.
  const seen = new Map<string, number>();
  for (const e of entries) {
    const n = (seen.get(e.filename) ?? 0) + 1;
    seen.set(e.filename, n);
    if (n > 1) {
      const dot = e.filename.lastIndexOf(".");
      e.filename =
        dot > 0
          ? `${e.filename.slice(0, dot)} (${n})${e.filename.slice(dot)}`
          : `${e.filename} (${n})`;
    }
  }

  // store: true → no recompression. Videos are already compressed, so this
  // saves CPU for ~no size win and keeps the stream moving.
  const archive = archiver("zip", { store: true });
  archive.on("warning", (err) => console.warn("[files/zip] warning", err));
  archive.on("error", (err) => console.error("[files/zip] archive error", err));

  // Feed the archive sequentially: fetch one clip, pipe its body into the
  // zip, and wait for that entry to be fully consumed before fetching the
  // next. This bounds memory and open B2 connections to a single clip at a
  // time. Runs detached — we return the stream immediately below.
  void (async () => {
    for (const e of entries) {
      try {
        const url = await getDownloadUrl(e.key, 60 * 60);
        const res = await fetch(url);
        if (!res.ok || !res.body) {
          console.warn(`[files/zip] skip ${e.key} (status ${res.status})`);
          continue;
        }
        const nodeBody = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
        archive.append(nodeBody, { name: e.filename });
        await new Promise<void>((resolve, reject) => {
          nodeBody.on("end", resolve);
          nodeBody.on("error", reject);
        });
      } catch (err) {
        console.error(`[files/zip] failed ${e.key}`, err);
      }
    }
    await archive.finalize();
  })().catch((err) => {
    console.error("[files/zip] fatal", err);
    archive.destroy(err as Error);
  });

  const filename = (body.name ?? `onpod-${Date.now()}`).replace(/[^\w.-]+/g, "_");
  const webStream = Readable.toWeb(archive) as ReadableStream<Uint8Array>;
  return new Response(webStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
