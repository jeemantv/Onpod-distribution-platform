// List all known thumbnail/cover sidecars saved next to a source file.
// The YouTube modal calls this and picks .cover.jpg as the default
// thumbnail. We also surface Bannerbear renders (.bb-*) and next/og
// composites (.cover-*) so anything created in ThumbnailStudio is
// available in the YT modal.

import { NextResponse } from "next/server";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { b2, bucket, decodeFileId, listFiles, publicUrl } from "@/lib/b2";
import { getSession } from "@/lib/session";
import { canAccessKey } from "@/lib/access";

const FIXED_SUFFIXES = [
  { suffix: ".cover.jpg", label: "cover", name: "Cover art" },
  { suffix: ".thumb-group.jpg", label: "group", name: "All speakers" },
  { suffix: ".thumb-primary.jpg", label: "primary", name: "Speaker A" },
  { suffix: ".thumb-secondary.jpg", label: "secondary", name: "Speaker B" },
  { suffix: ".thumb-smart-1.jpg", label: "smart-1", name: "Smart pick — top" },
  { suffix: ".thumb-smart-2.jpg", label: "smart-2", name: "Smart pick — 2" },
  { suffix: ".thumb-smart-3.jpg", label: "smart-3", name: "Smart pick — 3" },
];

async function exists(key: string): Promise<boolean> {
  try {
    await b2.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

export async function GET(
  _req: Request,
  { params }: { params: { fileId: string } },
) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let key: string;
  try {
    key = decodeFileId(params.fileId);
  } catch {
    return NextResponse.json({ error: "invalid_file_id" }, { status: 400 });
  }
  if (!canAccessKey(user, key)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const fixed = await Promise.all(
    FIXED_SUFFIXES.map(async (s) => {
      const fullKey = key + s.suffix;
      const present = await exists(fullKey);
      return present
        ? { label: s.label, name: s.name, url: publicUrl(fullKey), key: fullKey }
        : null;
    }),
  );

  // Dynamic outputs: list everything under the parent prefix that starts
  // with `${filename}.bb-` or `${filename}.cover-`. Both ThumbnailStudio
  // and Bannerbear write these.
  const slashIdx = key.lastIndexOf("/");
  const folderPrefix = slashIdx >= 0 ? key.slice(0, slashIdx + 1) : "";
  const filename = slashIdx >= 0 ? key.slice(slashIdx + 1) : key;
  const dynamic: { label: string; name: string; url: string; key: string }[] = [];
  try {
    const all = await listFiles(folderPrefix);
    for (const item of all) {
      const rel = item.key.slice(folderPrefix.length);
      if (!rel.startsWith(`${filename}.bb-`) && !rel.startsWith(`${filename}.cover-`)) {
        continue;
      }
      const trail = rel.slice(filename.length + 1);
      const stem = trail.replace(/\.(jpe?g|png|webp)$/i, "");
      dynamic.push({
        label: stem,
        name: stem.replace(/[-_]/g, " "),
        url: publicUrl(item.key),
        key: item.key,
      });
    }
  } catch {
    /* ignore listing errors */
  }

  return NextResponse.json({
    thumbnails: [...fixed.filter((r) => r !== null), ...dynamic],
  });
}
