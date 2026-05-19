// Stores transcript + AI content as sidecar JSON files next to the video in B2.
//
//   {videoKey}.transcript.json  — Deepgram result
//   {videoKey}.ai.json          — Claude AI package
//   {videoKey}.job.json         — active job marker (deleted on completion)

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { b2, bucket } from "./b2";
import type { DeepgramResult } from "./deepgram";
import type { AIPackage } from "./claude";

export const TRANSCRIPT_SUFFIX = ".transcript.json";
export const AI_SUFFIX = ".ai.json";
export const JOB_SUFFIX = ".job.json";

export interface JobMarker {
  videoKey: string;
  startedAt: number;
  stage: "transcribing" | "generating";
  requestId?: string;
  error?: string;
}

export function transcriptKey(videoKey: string): string {
  return videoKey + TRANSCRIPT_SUFFIX;
}
export function aiKey(videoKey: string): string {
  return videoKey + AI_SUFFIX;
}
export function jobKey(videoKey: string): string {
  return videoKey + JOB_SUFFIX;
}

async function exists(key: string): Promise<boolean> {
  try {
    await b2.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function readJson<T>(key: string): Promise<T | null> {
  try {
    const res = await b2.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    const text = await res.Body?.transformToString();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  await b2.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(value),
      ContentType: "application/json",
      CacheControl: "no-cache, no-store, must-revalidate",
    }),
  );
}

async function remove(key: string): Promise<void> {
  await b2
    .send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
    .catch(() => {});
}

export async function hasTranscript(videoKey: string): Promise<boolean> {
  return exists(transcriptKey(videoKey));
}
export async function hasAI(videoKey: string): Promise<boolean> {
  return exists(aiKey(videoKey));
}
export async function getTranscript(
  videoKey: string,
): Promise<DeepgramResult | null> {
  return readJson<DeepgramResult>(transcriptKey(videoKey));
}
export async function getAI(videoKey: string): Promise<AIPackage | null> {
  return readJson<AIPackage>(aiKey(videoKey));
}
export async function saveTranscript(
  videoKey: string,
  result: DeepgramResult,
): Promise<void> {
  await writeJson(transcriptKey(videoKey), result);
}
export async function saveAI(
  videoKey: string,
  ai: AIPackage,
): Promise<void> {
  await writeJson(aiKey(videoKey), ai);
}

export async function getJobMarker(videoKey: string): Promise<JobMarker | null> {
  return readJson<JobMarker>(jobKey(videoKey));
}
export async function setJobMarker(marker: JobMarker): Promise<void> {
  await writeJson(jobKey(marker.videoKey), marker);
}
export async function clearJobMarker(videoKey: string): Promise<void> {
  await remove(jobKey(videoKey));
}
