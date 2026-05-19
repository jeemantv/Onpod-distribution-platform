import { NextResponse } from "next/server";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { b2, bucket, decodeFileId, publicUrl } from "@/lib/b2";
import { getSession } from "@/lib/session";

const SUFFIXES = [
  { suffix: ".cover.jpg", label: "cover", name: "Cover art" },
  { suffix: ".thumb-group.jpg", label: "group", name: "All speakers" },
  { suffix: ".thumb-primary.jpg", label: "primary", name: "Speaker A" },
  { suffix: ".thumb-secondary.jpg", label: "secondary", name: "Speaker B" },
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
  const [ownerId] = key.split("/", 1);
  if (user.role !== "admin" && ownerId !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const results = await Promise.all(
    SUFFIXES.map(async (s) => {
      const fullKey = key + s.suffix;
      const present = await exists(fullKey);
      return present
        ? { label: s.label, name: s.name, url: publicUrl(fullKey), key: fullKey }
        : null;
    }),
  );
  return NextResponse.json({
    thumbnails: results.filter((r) => r !== null),
  });
}
