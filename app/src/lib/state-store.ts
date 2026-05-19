// Generic JSON state store backed by Backblaze B2. Serverless-safe
// (no fs). All app state files live under the _state/ prefix.

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { b2, bucket } from "./b2";

const PREFIX = "_state/";

function k(name: string): string {
  return name.startsWith(PREFIX) ? name : PREFIX + name;
}

export async function readState<T>(name: string, fallback: T): Promise<T> {
  try {
    const res = await b2.send(new GetObjectCommand({ Bucket: bucket, Key: k(name) }));
    const text = await res.Body?.transformToString();
    if (!text) return fallback;
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export async function writeState(name: string, value: unknown): Promise<void> {
  await b2.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: k(name),
      Body: JSON.stringify(value, null, 2),
      ContentType: "application/json",
      CacheControl: "no-cache, no-store, must-revalidate",
    }),
  );
}

export async function deleteState(name: string): Promise<void> {
  await b2.send(
    new DeleteObjectCommand({ Bucket: bucket, Key: k(name) }),
  ).catch(() => {});
}
