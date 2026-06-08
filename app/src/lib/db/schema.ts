import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// ---------- Enums ----------

export const userRole = pgEnum("user_role", ["admin", "editor", "client"]);
// Plan kinds live in TS (lib/types.ts → Plan + PLAN_LIMITS) so we can
// add tiers without an ALTER TYPE round-trip. The DB column is plain
// text — any string is allowed; the app validates against the TS enum.
export const studioLocation = pgEnum("studio_location", ["ottawa", "montreal", "brossard", "laval"]);
export const projectStatus = pgEnum("project_status", ["processing", "ready", "scheduled", "published"]);
export const fileType = pgEnum("file_type", ["raw", "edited", "clip", "asset"]);
export const transcriptSource = pgEnum("transcript_source", ["deepgram", "manual"]);
export const transcriptStage = pgEnum("transcript_stage", ["transcribing", "generating"]);
export const publishPlatform = pgEnum("publish_platform", ["youtube", "spotify", "opusclip"]);
export const publishAction = pgEnum("publish_action", ["draft", "scheduled", "published"]);
export const youtubeVidType = pgEnum("youtube_vid_type", ["long", "short"]);
export const approvalStatus = pgEnum("approval_status", ["pending", "approved", "rejected"]);
export const creditTxType = pgEnum("credit_tx_type", ["consume", "grant", "reset"]);
export const creditCategory = pgEnum("credit_category", ["podcasts", "articles", "opusClips", "coverArts"]);
export const opusJobStatus = pgEnum("opus_job_status", ["queued", "processing", "succeeded", "failed"]);
export const revisionStatus = pgEnum("revision_status", ["open", "in_review", "completed"]);
export const revisionNoteStatus = pgEnum("revision_note_status", ["open", "done"]);

// ---------- Users ----------

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    // Nullable while Auth.js magic-link migration is in flight; bcrypt path
    // populates it today, Auth.js path leaves it null. Removed in Phase 2.
    passwordHash: text("password_hash"),
    role: userRole("role").notNull().default("client"),
    plan: text("plan").notNull().default("free"),
    firstName: varchar("first_name", { length: 80 }).notNull(),
    lastName: varchar("last_name", { length: 80 }).notNull(),
    avatar: varchar("avatar", { length: 4 }).notNull(),
    avatarColor: text("avatar_color").notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true, mode: "date" }),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    // 7-day free trial window. Set on signup for new clients. When this
    // is in the past AND the user has no Stripe subscription, the
    // effective plan downgrades to "free" regardless of the `plan`
    // column. Cleared when admin assigns a plan or Stripe sub activates.
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true, mode: "date" }),
    // Buzzsprout integration: per-client podcast hosting. Token is the
    // client's personal Buzzsprout API token; podcastId identifies their
    // show. When both are set, the Buzzsprout button publishes via API
    // (Buzzsprout fans the episode out to Spotify/Apple/etc). When
    // missing, the modal falls back to the manual Spotify RSS flow.
    buzzsproutPodcastId: text("buzzsprout_podcast_id"),
    buzzsproutToken: text("buzzsprout_token"),
    // External video editor — the client's own freelancer who isn't on
    // OnPod's team. When set, the client's revision-request emails go
    // here, and the editor can sign in via /guest/<token> as a scoped
    // guest of just this one client (read+revise+upload versions).
    externalEditorEmail: text("external_editor_email"),
    externalEditorName: text("external_editor_name"),
    externalEditorToken: text("external_editor_token"),
    externalEditorRevokedAt: timestamp("external_editor_revoked_at", {
      withTimezone: true,
      mode: "date",
    }),
    creditsResetAt: timestamp("credits_reset_at", { withTimezone: true, mode: "date" }),
    // Client-only: which editor reviews their requests.
    assignedEditorEmail: varchar("assigned_editor_email", { length: 320 }),
    // Editor-only: ["all"] grants every studio, otherwise explicit slugs.
    assignedStudios: text("assigned_studios").array(),
    excludedClientEmails: text("excluded_client_emails").array(),
    // Client-only: which studio workspace they live in. Pearl-fed clients
    // → one of ottawa/montreal/brossard/laval. Website signups + manual
    // admin invites default to "externals".
    homeStudio: text("home_studio"),
    // Client-only: when true, the client sees a SessionUploader on their
    // session pages and can drop their own footage. Auto-on for
    // externals workspace via app logic.
    selfUploadEnabled: boolean("self_upload_enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
  },
  (t) => ({
    emailUnique: uniqueIndex("users_email_unique").on(t.email),
    roleIdx: index("users_role_idx").on(t.role),
  }),
);

// ---------- Account delegates (multi-guest team access) ----------

// A client can invite multiple team members (social media manager,
// assistant, freelance editor that's not the dedicated external_editor
// slot, etc). Each delegate gets a permanent guest URL signed against
// the same client identity, scoped via canAccessKey to that client's
// files only. They have editor-grade capabilities (notes, version
// upload, publish) but no access to billing or notification settings.
export const accountDelegates = pgTable(
  "account_delegates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 320 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    // Free-text role label shown in the UI (e.g. "Social media manager",
    // "Assistant"). Optional. Doesn't change permissions.
    label: varchar("label", { length: 80 }),
    token: text("token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
  },
  (t) => ({
    ownerIdx: index("account_delegates_owner_idx").on(t.ownerUserId),
    tokenUnique: uniqueIndex("account_delegates_token_unique").on(t.token),
  }),
);
export type AccountDelegateRow = typeof accountDelegates.$inferSelect;
export type NewAccountDelegateRow = typeof accountDelegates.$inferInsert;

// ---------- Studios (Phase 3.1) ----------

// Dynamic studio registry. Originally hardcoded as STUDIO_SLUGS in
// lib/studio.ts; now DB-backed so admins can spin up new workspaces.
// `kind` is a UX tag — "onpod" = Pearl-fed (n8n owns ingest), "external"
// = self-upload workspace owned by an external studio or the externals
// workspace.
export const studios = pgTable(
  "studios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    displayName: text("display_name").notNull(),
    kind: text("kind").notNull().default("external"),
    // External studios bring their own Stripe Payment Link. OnPod just
    // surfaces it on the signup confirmation page; we don't process the
    // payment ourselves. Null = no payment step shown to new clients.
    paymentLinkUrl: text("payment_link_url"),
    // Default editor for new clients created in this studio. The invite
    // flow uses this to auto-populate users.assignedEditorEmail so the
    // editor immediately sees the new client in their dashboard.
    defaultEditorEmail: text("default_editor_email"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    slugUnique: uniqueIndex("studios_slug_unique").on(t.slug),
  }),
);
export type StudioRow = typeof studios.$inferSelect;

// Shareable studio signup links. Scoped admin clicks "Generate invite"
// and gets a /invite/{token} URL they can embed on their site or share.
// On submit, the visitor is created as a client in the studio + sent a
// magic link.
export const studioInvites = pgTable(
  "studio_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studioSlug: text("studio_slug").notNull(),
    token: text("token").notNull(),
    label: text("label"),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    usedCount: integer("used_count").notNull().default(0),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: "date" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
  },
  (t) => ({
    tokenUnique: uniqueIndex("studio_invites_token_unique").on(t.token),
    slugIdx: index("studio_invites_slug_idx").on(t.studioSlug),
  }),
);
export type StudioInviteRow = typeof studioInvites.$inferSelect;

// ---------- Auth.js adapter tables (Phase 2 wires them up) ----------

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refreshToken: text("refresh_token"),
    accessToken: text("access_token"),
    expiresAt: integer("expires_at"),
    tokenType: text("token_type"),
    scope: text("scope"),
    idToken: text("id_token"),
    sessionState: text("session_state"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.provider, t.providerAccountId] }),
    userIdx: index("accounts_user_idx").on(t.userId),
  }),
);

export const sessions = pgTable(
  "sessions",
  {
    sessionToken: text("session_token").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => ({ userIdx: index("sessions_user_idx").on(t.userId) }),
);

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.identifier, t.token] }) }),
);

// Legacy bcrypt password reset tokens. Removed when Auth.js lands.
export const resetTokens = pgTable(
  "reset_tokens",
  {
    token: text("token").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 320 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    used: boolean("used").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({ userIdx: index("reset_tokens_user_idx").on(t.userId) }),
);

// ---------- Credits ----------

export const credits = pgTable("credits", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  podcastsUsed: integer("podcasts_used").notNull().default(0),
  articlesUsed: integer("articles_used").notNull().default(0),
  opusClipsUsed: integer("opus_clips_used").notNull().default(0),
  coverArtsUsed: integer("cover_arts_used").notNull().default(0),
  bonusPodcasts: integer("bonus_podcasts").notNull().default(0),
  bonusArticles: integer("bonus_articles").notNull().default(0),
  bonusOpusClips: integer("bonus_opus_clips").notNull().default(0),
  bonusCoverArts: integer("bonus_cover_arts").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const creditTransactions = pgTable(
  "credit_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: creditTxType("type").notNull(),
    category: creditCategory("category").notNull(),
    amount: integer("amount").notNull(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({ userTimeIdx: index("credit_tx_user_time_idx").on(t.userId, t.createdAt) }),
);

// ---------- Projects & Files ----------

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    location: studioLocation("location").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true, mode: "date" }).notNull(),
    cameraCount: integer("camera_count").notNull().default(1),
    durationLabel: varchar("duration_label", { length: 40 }).notNull(),
    status: projectStatus("status").notNull().default("processing"),
    backblazeFolderPath: text("backblaze_folder_path").notNull(),
    shareToken: text("share_token").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    userRecordedIdx: index("projects_user_recorded_idx").on(t.userId, t.recordedAt),
    shareTokenUnique: uniqueIndex("projects_share_token_unique").on(t.shareToken),
  }),
);

export const files = pgTable(
  "files",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: fileType("type").notNull(),
    mimeType: varchar("mime_type", { length: 120 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    backblazeKey: text("backblaze_key").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
  },
  (t) => ({
    projectTypeIdx: index("files_project_type_idx").on(t.projectId, t.type),
    backblazeKeyUnique: uniqueIndex("files_backblaze_key_unique").on(t.backblazeKey),
  }),
);

// ---------- Content (transcript + AI) ----------

// Sidecar tables key by B2 path (`video_key`) rather than `files.id`.
// The spec assumes a files-registry-first design (§5.3 upload flow); the
// current implementation lists from B2 directly. When §5.3 lands we add a
// nullable `file_id` column and backfill.

export const transcripts = pgTable(
  "transcripts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    videoKey: text("video_key").notNull(),
    text: text("text").notNull(),
    source: transcriptSource("source").notNull().default("deepgram"),
    deepgramRequestId: text("deepgram_request_id"),
    language: varchar("language", { length: 16 }),
    paragraphsJson: jsonb("paragraphs_json"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({ videoKeyUnique: uniqueIndex("transcripts_video_key_unique").on(t.videoKey) }),
);

// In-flight transcribe → AI-content pipelines. The AI button polls this to
// render progress and recover after restarts.
export const transcriptJobs = pgTable("transcript_jobs", {
  videoKey: text("video_key").primaryKey(),
  stage: transcriptStage("stage").notNull(),
  requestId: text("request_id"),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const aiContent = pgTable(
  "ai_content",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    videoKey: text("video_key").notNull(),
    title: text("title"),
    description: text("description"),
    chapters: text("chapters"),
    tags: jsonb("tags").$type<string[]>(),
    hashtags: jsonb("hashtags").$type<string[]>(),
    language: varchar("language", { length: 16 }),
    summary: text("summary"),
    articlesJson: jsonb("articles_json").$type<{
      linkedin?: string;
      wordpress?: string;
      newsletter?: string;
      medium?: string;
      seoBlog?: string;
    }>(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({ videoKeyUnique: uniqueIndex("ai_content_video_key_unique").on(t.videoKey) }),
);

// ---------- Publishing ----------

export const publishHistory = pgTable(
  "publish_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fileKey: text("file_key").notNull(),
    fileName: text("file_name").notNull(),
    platform: publishPlatform("platform").notNull(),
    action: publishAction("action").notNull(),
    vidType: youtubeVidType("vid_type"),
    externalId: text("external_id"),
    externalUrl: text("external_url"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true, mode: "date" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    fileKeyPlatformIdx: index("publish_history_file_key_platform_idx").on(t.fileKey, t.platform),
    userTimeIdx: index("publish_history_user_time_idx").on(t.userId, t.createdAt),
  }),
);

export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fileKey: text("file_key").notNull(),
    status: approvalStatus("status").notNull().default("pending"),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => users.id, { onDelete: "set null" }),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    note: text("note"),
    requestedAt: timestamp("requested_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true, mode: "date" }),
  },
  (t) => ({
    fileKeyIdx: index("approvals_file_key_idx").on(t.fileKey),
    statusIdx: index("approvals_status_idx").on(t.status),
  }),
);

// Per-studio customizable status options. Replaces the hardcoded
// pending/approved/rejected enum. Each studio gets a seeded set of 3
// statuses (the legacy values) plus whatever extras editors/admins add.
// `legacyValue` ties a status to one of the original enum values so old
// rows in file_meta.approval_status still resolve to a status row.
export const fileStatuses = pgTable(
  "file_statuses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    studioSlug: text("studio_slug").notNull(),
    label: text("label").notNull(),
    color: text("color").notNull(),
    position: integer("position").notNull().default(0),
    // null = custom status added by an editor. Non-null = one of the
    // three seeded defaults, used for back-compat with the old enum.
    legacyValue: text("legacy_value"),
    isDefault: boolean("is_default").notNull().default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    studioPosIdx: index("file_statuses_studio_pos_idx").on(t.studioSlug, t.position),
  }),
);
export type FileStatusRow = typeof fileStatuses.$inferSelect;
export type NewFileStatusRow = typeof fileStatuses.$inferInsert;

// Per-file overrides (folder type + approval status) when the filename
// alone can't carry the truth. Composite key on (owner_id, project_id,
// file_key). `owner_id` is text, not a FK — for studio paths the owner
// is the synthetic string "studios", which doesn't map to a users row.
export const fileMeta = pgTable(
  "file_meta",
  {
    ownerId: text("owner_id").notNull(),
    projectId: text("project_id").notNull(),
    fileKey: text("file_key").notNull(),
    type: fileType("type"),
    approvalStatus: approvalStatus("approval_status"),
    // FK to file_statuses; nullable so old rows still work. When set,
    // takes precedence over approval_status on the read path.
    statusId: uuid("status_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.ownerId, t.projectId, t.fileKey] }) }),
);

export const downloads = pgTable(
  "downloads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fileKey: text("file_key").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    downloadedAt: timestamp("downloaded_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    fileKeyIdx: index("downloads_file_key_idx").on(t.fileKey),
    userIdx: index("downloads_user_idx").on(t.userId),
  }),
);

// ---------- YouTube OAuth ----------

export const youtubeCredentials = pgTable("youtube_credentials", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  // Tokens are encrypted at the application layer before insert.
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  scope: text("scope").notNull().default(""),
  tokenType: text("token_type").notNull().default("Bearer"),
  // Each connected channel carries its OWN OAuth tokens so we can publish to
  // any of them (brand accounts each require a separate authorization). The
  // token columns above mirror the currently-active channel's tokens. Token
  // fields are optional for rows written before multi-channel support.
  channels: jsonb("channels").$type<Array<{
    id: string;
    title: string;
    thumbnailUrl: string | null;
    subscriberCount: string | null;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number; // epoch ms
    scope?: string;
    tokenType?: string;
  }>>().notNull(),
  activeChannelId: text("active_channel_id").notNull(),
  connectedAt: timestamp("connected_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

// ---------- Revisions (review notes attached to a video file) ----------

export const revisions = pgTable(
  "revisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    videoKey: text("video_key").notNull(),
    status: revisionStatus("status").notNull().default("open"),
    assignedEditorEmail: varchar("assigned_editor_email", { length: 320 }),
    reviewSentAt: timestamp("review_sent_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({ videoKeyUnique: uniqueIndex("revisions_video_key_unique").on(t.videoKey) }),
);

export const revisionNotes = pgTable(
  "revision_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => revisions.id, { onDelete: "cascade" }),
    timeSeconds: doublePrecision("time_seconds").notNull(),
    text: text("text").notNull(),
    status: revisionNoteStatus("status").notNull().default("open"),
    createdByEmail: varchar("created_by_email", { length: 320 }).notNull(),
    createdByName: varchar("created_by_name", { length: 160 }),
    doneAt: timestamp("done_at", { withTimezone: true, mode: "date" }),
    doneByEmail: varchar("done_by_email", { length: 320 }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({ revisionIdx: index("revision_notes_revision_idx").on(t.revisionId) }),
);

// ---------- File versions (multiple uploads of the "same" edit) ----------

export const fileVersions = pgTable(
  "file_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    canonicalKey: text("canonical_key").notNull(),
    n: integer("n").notNull(),
    backblazeKey: text("backblaze_key").notNull(),
    isActive: boolean("is_active").notNull().default(false),
    uploadedByEmail: varchar("uploaded_by_email", { length: 320 }).notNull(),
    uploadedByName: varchar("uploaded_by_name", { length: 160 }),
    note: text("note"),
    // The filename the user actually uploaded for this version. Stored
    // separately from `backblazeKey` (which uses the buildVersionedKey
    // convention to avoid path collisions). UI shows this when active.
    displayFilename: text("display_filename"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    canonicalNUnique: uniqueIndex("file_versions_canonical_n_unique").on(t.canonicalKey, t.n),
    activeIdx: index("file_versions_active_idx").on(t.canonicalKey, t.isActive),
  }),
);

// ---------- OpusClip jobs ----------

// Same shape as opus_jobs — Vizard is a parallel clipping provider. The
// "Clips" UI button opens a modal that lets the user pick which engine
// runs the job, and the result lands here keyed by Vizard's projectId.
// Operator-editable overrides for Vizard templates: custom name + uploaded
// preview image (key in B2). Joined onto the static config in
// vizard-templates.ts when the Clips modal renders the picker.
export const vizardTemplateOverrides = pgTable("vizard_template_overrides", {
  templateId: text("template_id").primaryKey(),
  name: text("name"),
  previewKey: text("preview_key"),
  // Optional 4-digit lock. When set, clients must enter the code before
  // submitting a Vizard job with this template. Admins + editors bypass.
  // Stored as plaintext on purpose — admins set/change this themselves
  // and the lock isn't a security boundary, it's a UX gate.
  lockCode: text("lock_code"),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const vizardJobs = pgTable(
  "vizard_jobs",
  {
    projectId: text("project_id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    videoKey: text("video_key").notNull(),
    sessionContext: text("session_context"),
    preferLength: integer("prefer_length").notNull().default(0),
    status: opusJobStatus("status").notNull().default("queued"),
    clipsDelivered: integer("clips_delivered").notNull().default(0),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
  },
  (t) => ({
    videoKeyIdx: index("vizard_jobs_video_key_idx").on(t.videoKey),
    userIdx: index("vizard_jobs_user_idx").on(t.userId),
  }),
);

export const opusJobs = pgTable(
  "opus_jobs",
  {
    jobId: text("job_id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    videoKey: text("video_key").notNull(),
    projectId: text("project_id"),
    stylePreset: text("style_preset").notNull(),
    status: opusJobStatus("status").notNull().default("queued"),
    clipsDelivered: integer("clips_delivered").notNull().default(0),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
  },
  (t) => ({
    videoKeyIdx: index("opus_jobs_video_key_idx").on(t.videoKey),
    userIdx: index("opus_jobs_user_idx").on(t.userId),
  }),
);

// ---------- Podcast RSS feed (Spotify §8) ----------

export const podcastShows = pgTable(
  "podcast_shows",
  {
    slug: varchar("slug", { length: 120 }).primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    author: text("author").notNull(),
    authorEmail: varchar("author_email", { length: 320 }).notNull(),
    language: varchar("language", { length: 16 }).notNull().default("en"),
    categoryItunes: text("category_itunes").notNull(),
    coverUrl: text("cover_url").notNull(),
    link: text("link").notNull(),
    explicit: boolean("explicit").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({ userIdx: index("podcast_shows_user_idx").on(t.userId) }),
);

export const podcastEpisodes = pgTable(
  "podcast_episodes",
  {
    guid: text("guid").primaryKey(),
    showSlug: varchar("show_slug", { length: 120 })
      .notNull()
      .references(() => podcastShows.slug, { onDelete: "cascade" }),
    fileId: uuid("file_id").references(() => files.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    audioUrl: text("audio_url").notNull(),
    audioMime: varchar("audio_mime", { length: 80 }).notNull(),
    audioBytes: bigint("audio_bytes", { mode: "number" }).notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    season: integer("season"),
    episode: integer("episode"),
    publishedAt: timestamp("published_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => ({
    showPublishedIdx: index("podcast_episodes_show_published_idx").on(t.showSlug, t.publishedAt),
  }),
);

// ---------- Rotating post buckets (SocialBee-style auto-poster) ----------

// A bucket auto-posts its clips to one YouTube channel on a repeating daily
// schedule, rotating through the items (wraps around → unlimited).
export const postBuckets = pgTable(
  "post_buckets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Target YouTube channel (from youtube_credentials.channels).
    channelId: text("channel_id").notNull(),
    channelTitle: text("channel_title"),
    visibility: text("visibility").notNull().default("public"), // public|unlisted|private
    // Post times as "HH:MM" (24h) in the bucket timezone, e.g. ["09:00","17:00"].
    times: jsonb("times").$type<string[]>().notNull().default([]),
    // Days of week to post (0=Sun..6=Sat). Empty = every day.
    days: jsonb("days").$type<number[]>().notNull().default([]),
    timezone: text("timezone").notNull().default("America/New_York"),
    // Optional title template; {n} = post number. Empty → derive from filename.
    titleTemplate: text("title_template"),
    active: boolean("active").notNull().default(true),
    // Rotation position (advances each post; index = cursor % itemCount).
    cursor: integer("cursor").notNull().default(0),
    // Idempotency: the last slot we posted ("YYYY-MM-DDTHH:MM" in tz).
    lastSlotKey: text("last_slot_key"),
    lastPostedAt: timestamp("last_posted_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("post_buckets_user_idx").on(t.userId),
    activeIdx: index("post_buckets_active_idx").on(t.active),
  }),
);

export const postBucketItems = pgTable(
  "post_bucket_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bucketId: uuid("bucket_id")
      .notNull()
      .references(() => postBuckets.id, { onDelete: "cascade" }),
    fileKey: text("file_key").notNull(), // B2 key of the clip
    fileName: text("file_name").notNull(),
    position: integer("position").notNull().default(0),
    postCount: integer("post_count").notNull().default(0),
    lastPostedAt: timestamp("last_posted_at", { withTimezone: true, mode: "date" }),
    addedAt: timestamp("added_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => ({
    bucketIdx: index("post_bucket_items_bucket_idx").on(t.bucketId),
    bucketFileUnique: uniqueIndex("post_bucket_items_bucket_file_unique").on(t.bucketId, t.fileKey),
  }),
);

// ---------- Inferred type exports ----------
// Pattern: `User` = select shape, `NewUser` = insert shape. Stores import these
// instead of redefining interfaces by hand.

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Credit = typeof credits.$inferSelect;
export type NewCredit = typeof credits.$inferInsert;
export type CreditTransaction = typeof creditTransactions.$inferSelect;
export type NewCreditTransaction = typeof creditTransactions.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type FileRow = typeof files.$inferSelect;
export type NewFile = typeof files.$inferInsert;
export type Transcript = typeof transcripts.$inferSelect;
export type NewTranscript = typeof transcripts.$inferInsert;
export type TranscriptJob = typeof transcriptJobs.$inferSelect;
export type NewTranscriptJob = typeof transcriptJobs.$inferInsert;
export type AiContent = typeof aiContent.$inferSelect;
export type NewAiContent = typeof aiContent.$inferInsert;
export type PublishHistoryRow = typeof publishHistory.$inferSelect;
export type NewPublishHistoryRow = typeof publishHistory.$inferInsert;
export type Approval = typeof approvals.$inferSelect;
export type NewApproval = typeof approvals.$inferInsert;
export type Download = typeof downloads.$inferSelect;
export type NewDownload = typeof downloads.$inferInsert;
export type FileMetaRow = typeof fileMeta.$inferSelect;
export type NewFileMetaRow = typeof fileMeta.$inferInsert;
export type YoutubeCredential = typeof youtubeCredentials.$inferSelect;
export type NewYoutubeCredential = typeof youtubeCredentials.$inferInsert;
export type Revision = typeof revisions.$inferSelect;
export type NewRevision = typeof revisions.$inferInsert;
export type RevisionNote = typeof revisionNotes.$inferSelect;
export type NewRevisionNote = typeof revisionNotes.$inferInsert;
export type FileVersion = typeof fileVersions.$inferSelect;
export type NewFileVersion = typeof fileVersions.$inferInsert;
export type OpusJob = typeof opusJobs.$inferSelect;
export type NewOpusJob = typeof opusJobs.$inferInsert;
export type VizardJob = typeof vizardJobs.$inferSelect;
export type NewVizardJob = typeof vizardJobs.$inferInsert;
export type VizardTemplateOverride = typeof vizardTemplateOverrides.$inferSelect;
export type NewVizardTemplateOverride = typeof vizardTemplateOverrides.$inferInsert;
export type PodcastShow = typeof podcastShows.$inferSelect;
export type NewPodcastShow = typeof podcastShows.$inferInsert;
export type PodcastEpisode = typeof podcastEpisodes.$inferSelect;
export type NewPodcastEpisode = typeof podcastEpisodes.$inferInsert;
export type ResetTokenRow = typeof resetTokens.$inferSelect;
export type NewResetToken = typeof resetTokens.$inferInsert;
