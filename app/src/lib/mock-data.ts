import type {
  AIContent,
  Credits,
  FileItem,
  Project,
  PublishHistoryEntry,
  Transcript,
  User,
} from "./types";

export const mockUsers: User[] = [
  {
    id: "u_admin",
    email: "admin@onpod.io",
    firstName: "Jeremy",
    lastName: "Prudhomme",
    avatar: "JP",
    avatarColor: "linear-gradient(135deg,#a855f7,#ec4899)",
    role: "admin",
    plan: "unlimited",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    creditsResetAt: "2026-06-01T00:00:00Z",
    createdAt: "2025-09-01T12:00:00Z",
  },
  {
    id: "u_editor",
    email: "editor@onpod.io",
    firstName: "Eli",
    lastName: "Editor",
    avatar: "EE",
    avatarColor: "linear-gradient(135deg,#60a5fa,#a855f7)",
    role: "editor",
    plan: "unlimited",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    creditsResetAt: "2026-06-01T00:00:00Z",
    createdAt: "2025-10-01T09:00:00Z",
  },
  {
    id: "u_client_1",
    email: "client@onpod.io",
    firstName: "Demo",
    lastName: "Client",
    avatar: "DC",
    avatarColor: "linear-gradient(135deg,#ff3b30,#ff8a00)",
    role: "client",
    plan: "unlimited",
    stripeCustomerId: "cus_mock_1",
    stripeSubscriptionId: "sub_mock_1",
    creditsResetAt: "2026-06-01T00:00:00Z",
    createdAt: "2025-11-12T14:30:00Z",
  },
  {
    id: "u_client_2",
    email: "sofia@example.com",
    firstName: "Sofia",
    lastName: "Tremblay",
    avatar: "ST",
    avatarColor: "linear-gradient(135deg,#14b8a6,#60a5fa)",
    role: "client",
    plan: "onpod_studio",
    stripeCustomerId: "cus_mock_2",
    stripeSubscriptionId: "sub_mock_2",
    creditsResetAt: "2026-06-01T00:00:00Z",
    createdAt: "2026-01-22T10:15:00Z",
  },
  {
    id: "u_client_3",
    email: "olivier@example.com",
    firstName: "Olivier",
    lastName: "Bouchard",
    avatar: "OB",
    avatarColor: "linear-gradient(135deg,#f59e0b,#ef4444)",
    role: "client",
    plan: "ext_studio_base",
    stripeCustomerId: "cus_mock_3",
    stripeSubscriptionId: "sub_mock_3",
    creditsResetAt: "2026-06-01T00:00:00Z",
    createdAt: "2025-08-04T09:00:00Z",
  },
];

export const mockCredits: Credits[] = [
  { userId: "u_admin",    podcastsUsed: 0, articlesUsed: 0,  opusClipsUsed: 0,  coverArtsUsed: 0,
    bonusPodcasts: 0, bonusArticles: 0, bonusOpusClips: 0, bonusCoverArts: 0 },
  { userId: "u_editor",   podcastsUsed: 0, articlesUsed: 0,  opusClipsUsed: 0,  coverArtsUsed: 0,
    bonusPodcasts: 0, bonusArticles: 0, bonusOpusClips: 0, bonusCoverArts: 0 },
  { userId: "u_client_1", podcastsUsed: 2, articlesUsed: 14, opusClipsUsed: 11, coverArtsUsed: 3,
    bonusPodcasts: 0, bonusArticles: 0, bonusOpusClips: 0, bonusCoverArts: 0 },
  { userId: "u_client_2", podcastsUsed: 1, articlesUsed: 4,  opusClipsUsed: 2,  coverArtsUsed: 1,
    bonusPodcasts: 0, bonusArticles: 0, bonusOpusClips: 0, bonusCoverArts: 0 },
  { userId: "u_client_3", podcastsUsed: 5, articlesUsed: 22, opusClipsUsed: 18, coverArtsUsed: 6,
    bonusPodcasts: 0, bonusArticles: 0, bonusOpusClips: 0, bonusCoverArts: 0 },
];

export const mockProjects: Project[] = [
  {
    id: "p_001",
    userId: "u_client_1",
    title: "Founders Lounge — Episode 47",
    location: "laval",
    recordedAt: "2026-05-11",
    cameraCount: 6,
    duration: "1h 24m",
    status: "ready",
    backblazeFolderPath: "u_client_1/p_001",
    shareToken: "share_p001_abc",
    createdAt: "2026-05-11T18:00:00Z",
  },
  {
    id: "p_002",
    userId: "u_client_1",
    title: "Founders Lounge — Episode 46",
    location: "montreal",
    recordedAt: "2026-04-28",
    cameraCount: 4,
    duration: "58m",
    status: "published",
    backblazeFolderPath: "u_client_1/p_002",
    shareToken: "share_p002_def",
    createdAt: "2026-04-28T18:00:00Z",
  },
  {
    id: "p_003",
    userId: "u_client_1",
    title: "Founders Lounge — Episode 45",
    location: "ottawa",
    recordedAt: "2026-04-12",
    cameraCount: 6,
    duration: "1h 12m",
    status: "scheduled",
    backblazeFolderPath: "u_client_1/p_003",
    shareToken: "share_p003_ghi",
    createdAt: "2026-04-12T18:00:00Z",
  },
  {
    id: "p_004",
    userId: "u_client_1",
    title: "Founders Lounge — Episode 44",
    location: "brossard",
    recordedAt: "2025-12-08",
    cameraCount: 4,
    duration: "1h 02m",
    status: "published",
    backblazeFolderPath: "u_client_1/p_004",
    shareToken: "share_p004_jkl",
    createdAt: "2025-12-08T18:00:00Z",
  },
  {
    id: "p_005",
    userId: "u_client_2",
    title: "Café Conversations — Episode 12",
    location: "montreal",
    recordedAt: "2026-05-04",
    cameraCount: 3,
    duration: "47m",
    status: "ready",
    backblazeFolderPath: "u_client_2/p_005",
    shareToken: "share_p005_mno",
    createdAt: "2026-05-04T18:00:00Z",
  },
  {
    id: "p_006",
    userId: "u_client_3",
    title: "Bouchard Live — Season 3 Premiere",
    location: "ottawa",
    recordedAt: "2026-05-15",
    cameraCount: 8,
    duration: "1h 41m",
    status: "processing",
    backblazeFolderPath: "u_client_3/p_006",
    shareToken: "share_p006_pqr",
    createdAt: "2026-05-15T18:00:00Z",
  },
];

const mkFiles = (
  projectId: string,
  spec: { name: string; type: FileItem["type"]; sizeMb: number; status?: FileItem["approvalStatus"]; publishStates?: FileItem["publishStates"]; downloads?: number }[],
): FileItem[] =>
  spec.map((s, i) => ({
    id: `f_${projectId}_${i}`,
    projectId,
    name: s.name,
    type: s.type,
    mimeType: s.name.endsWith(".mp4")
      ? "video/mp4"
      : s.name.endsWith(".wav")
        ? "audio/wav"
        : s.name.endsWith(".png")
          ? "image/png"
          : "application/octet-stream",
    sizeBytes: Math.floor(s.sizeMb * 1024 * 1024),
    backblazeKey: `${projectId}/${s.name}`,
    uploadedAt: "2026-05-11T20:00:00Z",
    approvalStatus: s.status ?? "none",
    publishStates: s.publishStates ?? [],
    downloadCount: s.downloads ?? 0,
  }));

export const mockFiles: Record<string, FileItem[]> = {
  p_001: mkFiles("p_001", [
    { name: "Cam1_Wide_Master.mp4", type: "raw", sizeMb: 4200 },
    { name: "Cam2_Host.mp4", type: "raw", sizeMb: 3800 },
    { name: "Cam3_Guest.mp4", type: "raw", sizeMb: 3650 },
    { name: "Cam4_Overhead.mp4", type: "raw", sizeMb: 2900 },
    { name: "Cam5_BRoll.mp4", type: "raw", sizeMb: 1800 },
    { name: "Cam6_Side.mp4", type: "raw", sizeMb: 2200 },
    { name: "Audio_Master_Stereo.wav", type: "raw", sizeMb: 1200 },
    { name: "Founders_Lounge_E47_Edited_v3.mp4", type: "edited", sizeMb: 2800, status: "approved" },
    { name: "Clip_Hook_Money_Mistake.mp4", type: "clip", sizeMb: 28, status: "approved",
      publishStates: [{ platform: "youtube", action: "published", vidType: "short" }] },
    { name: "Clip_Best_Advice_Moment.mp4", type: "clip", sizeMb: 32 },
    { name: "Clip_Disagreement_Spike.mp4", type: "clip", sizeMb: 25 },
    { name: "Episode_Cover_v2.png", type: "asset", sizeMb: 4 },
    { name: "Lower_Third_Title.png", type: "asset", sizeMb: 2 },
  ]),
  p_002: mkFiles("p_002", [
    { name: "Founders_Lounge_E46_Edited.mp4", type: "edited", sizeMb: 2400, status: "approved",
      publishStates: [{ platform: "youtube", action: "published", vidType: "long" }, { platform: "spotify", action: "published" }] },
    { name: "Cam1_Master.mp4", type: "raw", sizeMb: 3900 },
    { name: "Audio_Master.wav", type: "raw", sizeMb: 1100 },
  ]),
  p_003: mkFiles("p_003", [
    { name: "Founders_Lounge_E45_Edited.mp4", type: "edited", sizeMb: 2600, status: "approved",
      publishStates: [{ platform: "youtube", action: "scheduled", vidType: "long" }] },
  ]),
  p_004: mkFiles("p_004", [
    { name: "Founders_Lounge_E44_Edited.mp4", type: "edited", sizeMb: 2300, status: "approved",
      publishStates: [{ platform: "youtube", action: "published", vidType: "long" }] },
  ]),
  p_005: mkFiles("p_005", [
    { name: "Cafe_Conversations_E12_Edited.mp4", type: "edited", sizeMb: 1900 },
    { name: "Cam1_Master.mp4", type: "raw", sizeMb: 3200 },
  ]),
  p_006: [],
};

export const mockTranscripts: Record<string, Transcript> = {};

export const mockAIContent: Record<string, AIContent> = {
  "f_p_001_7": {
    id: "ai_1",
    fileId: "f_p_001_7",
    title: "Why most founders never escape the grind (and what the 1% do differently)",
    description:
      "In this episode of Founders Lounge, we sit down with three Canadian founders who have all crossed seven figures in revenue — and they pull no punches on the mistakes they wish they'd avoided.\n\nWe cover:\n- The single biggest hiring mistake first-time founders make\n- Why your 'product-market fit' is probably a mirage\n- How to know when to fundraise versus bootstrap\n- A surprisingly simple test for whether your business is actually scalable\n\nIf you're building anything from a side hustle to a venture-backed startup, this one's for you.\n\n👉 Subscribe for new episodes every week.\n👉 Join the OnPod community: onpod.io",
    chapters:
      "00:00 Intro and guest introductions\n02:15 The biggest hiring mistake\n10:42 PMF as a moving target\n22:08 Fundraise vs bootstrap\n34:21 The scalability test\n45:50 Founder mental health\n58:12 Audience Q&A\n1:18:00 Closing thoughts",
    tags: [
      "founders","startup","entrepreneurship","bootstrapping","venture capital",
      "hiring","product market fit","scaling","Canadian startups","Montreal tech",
      "podcast","business advice","scaling a business","seven figures","founder mistakes",
    ],
    hashtags: ["#founders","#startup","#entrepreneurship","#bootstrap","#vc","#scaling","#productmarketfit","#canadianbusiness"],
    language: "English",
    summary:
      "Three seven-figure Canadian founders share the mistakes that almost broke them, the test they use to decide whether to fundraise, and why most product-market fit claims are wishful thinking.",
    articlesJson: {},
    updatedAt: "2026-05-12T09:00:00Z",
  },
};

export const mockPublishHistory: PublishHistoryEntry[] = [
  {
    id: "ph_1",
    fileId: "f_p_002_0",
    platform: "youtube",
    action: "published",
    vidType: "long",
    externalId: "yt_abc123",
    scheduledFor: null,
    metadata: { title: "Founders Lounge — E46" },
    createdAt: "2026-04-29T15:00:00Z",
  },
  {
    id: "ph_2",
    fileId: "f_p_003_0",
    platform: "youtube",
    action: "scheduled",
    vidType: "long",
    externalId: null,
    scheduledFor: "2026-05-22T15:00:00Z",
    metadata: { title: "Founders Lounge — E45" },
    createdAt: "2026-04-15T15:00:00Z",
  },
  {
    id: "ph_3",
    fileId: "f_p_001_8",
    platform: "youtube",
    action: "published",
    vidType: "short",
    externalId: "yt_short_xyz",
    scheduledFor: null,
    metadata: { title: "The biggest hiring mistake" },
    createdAt: "2026-05-13T14:00:00Z",
  },
];

export function getProjectsForUser(userId: string): Project[] {
  return mockProjects
    .filter((p) => p.userId === userId)
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
}

export function getAllProjects(): Project[] {
  return [...mockProjects].sort((a, b) =>
    b.recordedAt.localeCompare(a.recordedAt),
  );
}

export function getFilesForProject(projectId: string): FileItem[] {
  return mockFiles[projectId] ?? [];
}

export function getUserById(userId: string): User | undefined {
  return mockUsers.find((u) => u.id === userId);
}

export function getUserByEmail(email: string): User | undefined {
  return mockUsers.find((u) => u.email.toLowerCase() === email.toLowerCase());
}

export function getCreditsForUser(userId: string): Credits | undefined {
  return mockCredits.find((c) => c.userId === userId);
}

export function getProjectById(projectId: string): Project | undefined {
  return mockProjects.find((p) => p.id === projectId);
}

export function getAIContentForFile(fileId: string): AIContent | undefined {
  return mockAIContent[fileId];
}

export function getPublishHistoryForUser(userId: string): PublishHistoryEntry[] {
  const userProjects = new Set(
    mockProjects.filter((p) => p.userId === userId).map((p) => p.id),
  );
  const userFiles = new Set(
    Object.entries(mockFiles)
      .filter(([pid]) => userProjects.has(pid))
      .flatMap(([, files]) => files.map((f) => f.id)),
  );
  return mockPublishHistory.filter((h) => userFiles.has(h.fileId));
}
