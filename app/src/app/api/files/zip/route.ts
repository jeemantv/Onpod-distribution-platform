// Bundle multiple files into a single .zip and stream it back. Used by
// the bulk "Download" button — saves the user from browser blocking on
// rapid multi-downloads and gets a single named archive.
//
// Uses JSZip (pure JS, works in Node + Next without webpack drama).
// Trade-off vs archiver: JSZip buffers in memory before emitting. Fine
// for a handful of clips, but a 50-file 20GB batch would OOM. Anything
// approaching that should switch to streaming archiver via standalone
// Node runtime.

import { NextResponse } from "next/server";
import JSZip from "jszip";
import { getSession } from "@/lib/session";
import { decodeFileId, getDownloadUrl } from "@/lib/b2";
import { canAccessKey } from "@/lib/access";

export const runtime = "nodejs";
export const maxDuration = 300;

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

  // Decode + auth every key up front so a bad ID fails fast (no half-
  // written zip).
  const entries: { key: string; filename: string }[] = [];
  for (const fileId of body.fileIds) {
    let key: string;
    try {
      key = decodeFileId(fileId);
    } catch {
      return NextResponse.json(
        { error: "invalid_file_id", fileId },
        { status: 400 },
      );
    }
    if (!canAccessKey(user, key)) {
      return NextResponse.json(
        { error: "forbidden", fileId },
        { status: 403 },
      );
    }
    entries.push({ key, filename: key.split("/").pop() ?? "file" });
  }

  // Deduplicate names so two files with the same basename don't clobber
  // each other in the archive.
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

  const zip = new JSZip();
  for (const e of entries) {
    try {
      const url = await getDownloadUrl(e.key, 60 * 60);
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[files/zip] skip ${e.key} (status ${res.status})`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      // Level 0 = store. Videos are already compressed; recompressing
      // burns CPU for ~no size win.
      zip.file(e.filename, buf, { compression: "STORE" });
    } catch (err) {
      console.error(`[files/zip] failed ${e.key}`, err);
    }
  }

  const archive = await zip.generateAsync({
    type: "nodebuffer",
    compression: "STORE",
  });

  const filename = (body.name ?? `onpod-${Date.now()}`).replace(/[^\w.-]+/g, "_");
  // Buffer → Uint8Array → BodyInit (NextResponse types don't accept Buffer directly).
  return new NextResponse(new Uint8Array(archive), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}.zip"`,
      "Cache-Control": "no-store",
      "Content-Length": String(archive.byteLength),
    },
  });
}
