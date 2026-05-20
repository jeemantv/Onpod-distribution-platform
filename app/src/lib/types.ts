export type Role = "client" | "editor" | "admin";
export type Plan = "starter" | "pro" | "authority" | "unlimited";
export type StudioLocation = "ottawa" | "montreal" | "brossard" | "laval";
export type ProjectStatus =
  | "processing"
  | "ready"
  | "scheduled"
  | "published";
export type FileType = "raw" | "edited" | "clip" | "asset";
export type PublishPlatform = "youtube" | "spotify" | "opusclip";
export type PublishAction = "draft" | "scheduled" | "published";
export type VidType = "long" | "short";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "none";

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar: string;
  avatarColor: string;
  role: Role;
  plan: Plan;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  creditsResetAt: string;
  createdAt: string;
}

export interface Credits {
  userId: string;
  podcastsUsed: number;
  articlesUsed: number;
  opusClipsUsed: number;
  coverArtsUsed: number;
  bonusPodcasts: number;
  bonusArticles: number;
  bonusOpusClips: number;
  bonusCoverArts: number;
}

export interface Project {
  id: string;
  userId: string;
  title: string;
  location: StudioLocation;
  recordedAt: string;
  cameraCount: number;
  duration: string;
  status: ProjectStatus;
  backblazeFolderPath: string;
  shareToken: string;
  createdAt: string;
}

export interface FileItem {
  id: string;
  projectId: string;
  name: string;
  type: FileType;
  mimeType: string;
  sizeBytes: number;
  backblazeKey: string;
  uploadedAt: string;
  approvalStatus: ApprovalStatus;
  publishStates: { platform: PublishPlatform; action: PublishAction; vidType?: VidType }[];
  downloadCount: number;
}

export interface Transcript {
  id: string;
  fileId: string;
  text: string;
  source: "deepgram" | "manual";
  deepgramRequestId: string | null;
  language: string;
  paragraphsJson: { start: string; text: string }[];
  createdAt: string;
}

export interface AIContent {
  id: string;
  fileId: string;
  title: string;
  description: string;
  chapters: string;
  tags: string[];
  hashtags: string[];
  language: string;
  summary: string;
  articlesJson: Partial<Record<ArticleFormat, string>>;
  updatedAt: string;
}

export type ArticleFormat =
  | "linkedin"
  | "wordpress"
  | "newsletter"
  | "medium"
  | "seoBlog";

export interface PublishHistoryEntry {
  id: string;
  fileId: string;
  platform: PublishPlatform;
  action: PublishAction;
  vidType: VidType | null;
  externalId: string | null;
  scheduledFor: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export const PLAN_LIMITS: Record<Plan, {
  podcasts: number;
  articles: number;
  opusClips: number;
  coverArts: number;
  priceCad: number;
}> = {
  starter:   { podcasts: 2, articles: 10,        opusClips: 6,        coverArts: 2,        priceCad: 299 },
  pro:       { podcasts: 4, articles: 30,        opusClips: 20,       coverArts: 8,        priceCad: 699 },
  authority: { podcasts: 8, articles: Infinity,  opusClips: Infinity, coverArts: Infinity, priceCad: 1499 },
  unlimited: { podcasts: Infinity, articles: Infinity, opusClips: Infinity, coverArts: Infinity, priceCad: 0 },
};

export const LOCATION_LABEL: Record<StudioLocation, string> = {
  ottawa: "Ottawa",
  montreal: "Montréal",
  brossard: "Brossard",
  laval: "Laval",
};
