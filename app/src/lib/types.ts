export type Role = "client" | "editor" | "admin";
// Pricing tiers. Each gives the same monthly bundle of 6 episodes / 60 reels /
// 10 thumbnails on the base tiers, and 2x on the double tiers.
// "onpod_studio" is bundled (paid by the OnPod studio, free for the client).
// "direct_*" is sold to clients not attached to an OnPod studio.
// "ext_studio_*" is for clients of external (white-label) studios.
export type Plan =
  | "free"
  | "onpod_studio"
  | "direct_base"
  | "direct_double"
  | "ext_studio_base"
  | "ext_studio_double"
  | "unlimited";

export type PlanSource = "onpod" | "direct" | "external" | "admin";
export type PlanTier = "base" | "double";
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
  // Set when this user is acting as a guest editor on behalf of the
  // client identified by id/email. Lets call-sites detect impersonation
  // (audit attribution, banner UI, narrower canAccessKey).
  guest?: { email: string; name: string };
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
  // Per-studio custom status. When null/undefined, the UI falls back to
  // mapping approvalStatus to the matching legacy status row.
  statusId?: string | null;
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

export interface PlanLimit {
  label: string;
  tier: PlanTier;
  source: PlanSource;
  // Monthly bundle
  episodes: number;
  reels: number;
  thumbnails: number;
  // Legacy aliases (other files still read these names)
  podcasts: number;
  articles: number;
  opusClips: number;
  coverArts: number;
  priceUsd: number;
  priceCad: number;
  billed: "free" | "client" | "studio";
}

const BASE = { episodes: 6, reels: 60, thumbnails: 10, articles: 30 };
const DOUBLE = { episodes: 12, reels: 120, thumbnails: 20, articles: 60 };

export const PLAN_LIMITS: Record<Plan, PlanLimit> = {
  free: {
    label: "Free (download + approve only)",
    tier: "base",
    source: "direct",
    episodes: 0,
    reels: 0,
    thumbnails: 0,
    articles: 0,
    podcasts: 0,
    opusClips: 0,
    coverArts: 0,
    priceUsd: 0,
    priceCad: 0,
    billed: "free",
  },
  onpod_studio: {
    label: "OnPod Studio (free)",
    tier: "base",
    source: "onpod",
    ...BASE,
    podcasts: BASE.episodes,
    opusClips: BASE.reels,
    coverArts: BASE.thumbnails,
    priceUsd: 0,
    priceCad: 0,
    billed: "free",
  },
  direct_base: {
    label: "OnPod Studio direct",
    tier: "base",
    source: "direct",
    ...BASE,
    podcasts: BASE.episodes,
    opusClips: BASE.reels,
    coverArts: BASE.thumbnails,
    priceUsd: 39,
    priceCad: 39,
    billed: "client",
  },
  direct_double: {
    label: "OnPod Studio direct ×2",
    tier: "double",
    source: "direct",
    ...DOUBLE,
    podcasts: DOUBLE.episodes,
    opusClips: DOUBLE.reels,
    coverArts: DOUBLE.thumbnails,
    priceUsd: 89,
    priceCad: 89,
    billed: "client",
  },
  ext_studio_base: {
    label: "Starter",
    tier: "base",
    source: "external",
    ...BASE,
    podcasts: BASE.episodes,
    opusClips: BASE.reels,
    coverArts: BASE.thumbnails,
    priceUsd: 39,
    priceCad: 39,
    billed: "client",
  },
  ext_studio_double: {
    label: "Master",
    tier: "double",
    source: "external",
    ...DOUBLE,
    podcasts: DOUBLE.episodes,
    opusClips: DOUBLE.reels,
    coverArts: DOUBLE.thumbnails,
    priceUsd: 89,
    priceCad: 89,
    billed: "client",
  },
  unlimited: {
    label: "Unlimited (admin)",
    tier: "double",
    source: "admin",
    episodes: Infinity,
    reels: Infinity,
    thumbnails: Infinity,
    podcasts: Infinity,
    articles: Infinity,
    opusClips: Infinity,
    coverArts: Infinity,
    priceUsd: 0,
    priceCad: 0,
    billed: "free",
  },
};

export const LOCATION_LABEL: Record<StudioLocation, string> = {
  ottawa: "Ottawa",
  montreal: "Montréal",
  brossard: "Brossard",
  laval: "Laval",
};
