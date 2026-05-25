CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."credit_category" AS ENUM('podcasts', 'articles', 'opusClips', 'coverArts');--> statement-breakpoint
CREATE TYPE "public"."credit_tx_type" AS ENUM('consume', 'grant', 'reset');--> statement-breakpoint
CREATE TYPE "public"."file_type" AS ENUM('raw', 'edited', 'clip', 'asset');--> statement-breakpoint
CREATE TYPE "public"."opus_job_status" AS ENUM('queued', 'processing', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('processing', 'ready', 'scheduled', 'published');--> statement-breakpoint
CREATE TYPE "public"."publish_action" AS ENUM('draft', 'scheduled', 'published');--> statement-breakpoint
CREATE TYPE "public"."publish_platform" AS ENUM('youtube', 'spotify', 'opusclip');--> statement-breakpoint
CREATE TYPE "public"."revision_note_status" AS ENUM('open', 'done');--> statement-breakpoint
CREATE TYPE "public"."revision_status" AS ENUM('open', 'in_review', 'completed');--> statement-breakpoint
CREATE TYPE "public"."studio_location" AS ENUM('ottawa', 'montreal', 'brossard', 'laval');--> statement-breakpoint
CREATE TYPE "public"."transcript_source" AS ENUM('deepgram', 'manual');--> statement-breakpoint
CREATE TYPE "public"."transcript_stage" AS ENUM('transcribing', 'generating');--> statement-breakpoint
CREATE TYPE "public"."user_plan" AS ENUM('starter', 'pro', 'authority', 'unlimited');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'editor', 'client');--> statement-breakpoint
CREATE TYPE "public"."youtube_vid_type" AS ENUM('long', 'short');--> statement-breakpoint
CREATE TABLE "accounts" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "ai_content" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_key" text NOT NULL,
	"title" text,
	"description" text,
	"chapters" text,
	"tags" jsonb,
	"hashtags" jsonb,
	"language" varchar(16),
	"summary" text,
	"articles_json" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_key" text NOT NULL,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"requested_by" uuid NOT NULL,
	"decided_by" uuid,
	"note" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "credit_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "credit_tx_type" NOT NULL,
	"category" "credit_category" NOT NULL,
	"amount" integer NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credits" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"podcasts_used" integer DEFAULT 0 NOT NULL,
	"articles_used" integer DEFAULT 0 NOT NULL,
	"opus_clips_used" integer DEFAULT 0 NOT NULL,
	"cover_arts_used" integer DEFAULT 0 NOT NULL,
	"bonus_podcasts" integer DEFAULT 0 NOT NULL,
	"bonus_articles" integer DEFAULT 0 NOT NULL,
	"bonus_opus_clips" integer DEFAULT 0 NOT NULL,
	"bonus_cover_arts" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "downloads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_key" text NOT NULL,
	"user_id" uuid NOT NULL,
	"downloaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_meta" (
	"owner_id" text NOT NULL,
	"project_id" text NOT NULL,
	"file_key" text NOT NULL,
	"type" "file_type",
	"approval_status" "approval_status",
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "file_meta_owner_id_project_id_file_key_pk" PRIMARY KEY("owner_id","project_id","file_key")
);
--> statement-breakpoint
CREATE TABLE "file_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_key" text NOT NULL,
	"n" integer NOT NULL,
	"backblaze_key" text NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"uploaded_by_email" varchar(320) NOT NULL,
	"uploaded_by_name" varchar(160),
	"note" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "file_type" NOT NULL,
	"mime_type" varchar(120) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"backblaze_key" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "opus_jobs" (
	"job_id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"video_key" text NOT NULL,
	"project_id" text,
	"style_preset" text NOT NULL,
	"status" "opus_job_status" DEFAULT 'queued' NOT NULL,
	"clips_delivered" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "podcast_episodes" (
	"guid" text PRIMARY KEY NOT NULL,
	"show_slug" varchar(120) NOT NULL,
	"file_id" uuid,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"audio_url" text NOT NULL,
	"audio_mime" varchar(80) NOT NULL,
	"audio_bytes" bigint NOT NULL,
	"duration_seconds" integer NOT NULL,
	"season" integer,
	"episode" integer,
	"published_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "podcast_shows" (
	"slug" varchar(120) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"author" text NOT NULL,
	"author_email" varchar(320) NOT NULL,
	"language" varchar(16) DEFAULT 'en' NOT NULL,
	"category_itunes" text NOT NULL,
	"cover_url" text NOT NULL,
	"link" text NOT NULL,
	"explicit" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"location" "studio_location" NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"camera_count" integer DEFAULT 1 NOT NULL,
	"duration_label" varchar(40) NOT NULL,
	"status" "project_status" DEFAULT 'processing' NOT NULL,
	"backblaze_folder_path" text NOT NULL,
	"share_token" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publish_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"file_key" text NOT NULL,
	"file_name" text NOT NULL,
	"platform" "publish_platform" NOT NULL,
	"action" "publish_action" NOT NULL,
	"vid_type" "youtube_vid_type",
	"external_id" text,
	"external_url" text,
	"scheduled_for" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reset_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"email" varchar(320) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revision_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revision_id" uuid NOT NULL,
	"time_seconds" double precision NOT NULL,
	"text" text NOT NULL,
	"status" "revision_note_status" DEFAULT 'open' NOT NULL,
	"created_by_email" varchar(320) NOT NULL,
	"created_by_name" varchar(160),
	"done_at" timestamp with time zone,
	"done_by_email" varchar(320),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_key" text NOT NULL,
	"status" "revision_status" DEFAULT 'open' NOT NULL,
	"assigned_editor_email" varchar(320),
	"review_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcript_jobs" (
	"video_key" text PRIMARY KEY NOT NULL,
	"stage" "transcript_stage" NOT NULL,
	"request_id" text,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_key" text NOT NULL,
	"text" text NOT NULL,
	"source" "transcript_source" DEFAULT 'deepgram' NOT NULL,
	"deepgram_request_id" text,
	"language" varchar(16),
	"paragraphs_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"password_hash" text,
	"role" "user_role" DEFAULT 'client' NOT NULL,
	"plan" "user_plan" DEFAULT 'starter' NOT NULL,
	"first_name" varchar(80) NOT NULL,
	"last_name" varchar(80) NOT NULL,
	"avatar" varchar(4) NOT NULL,
	"avatar_color" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"credits_reset_at" timestamp with time zone,
	"assigned_editor_email" varchar(320),
	"assigned_studios" text[],
	"excluded_client_emails" text[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "youtube_credentials" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"scope" text DEFAULT '' NOT NULL,
	"token_type" text DEFAULT 'Bearer' NOT NULL,
	"channels" jsonb NOT NULL,
	"active_channel_id" text NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credits" ADD CONSTRAINT "credits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downloads" ADD CONSTRAINT "downloads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opus_jobs" ADD CONSTRAINT "opus_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "podcast_episodes" ADD CONSTRAINT "podcast_episodes_show_slug_podcast_shows_slug_fk" FOREIGN KEY ("show_slug") REFERENCES "public"."podcast_shows"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "podcast_episodes" ADD CONSTRAINT "podcast_episodes_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "podcast_shows" ADD CONSTRAINT "podcast_shows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_history" ADD CONSTRAINT "publish_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reset_tokens" ADD CONSTRAINT "reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revision_notes" ADD CONSTRAINT "revision_notes_revision_id_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youtube_credentials" ADD CONSTRAINT "youtube_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_content_video_key_unique" ON "ai_content" USING btree ("video_key");--> statement-breakpoint
CREATE INDEX "approvals_file_key_idx" ON "approvals" USING btree ("file_key");--> statement-breakpoint
CREATE INDEX "approvals_status_idx" ON "approvals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "credit_tx_user_time_idx" ON "credit_transactions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "downloads_file_key_idx" ON "downloads" USING btree ("file_key");--> statement-breakpoint
CREATE INDEX "downloads_user_idx" ON "downloads" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "file_versions_canonical_n_unique" ON "file_versions" USING btree ("canonical_key","n");--> statement-breakpoint
CREATE INDEX "file_versions_active_idx" ON "file_versions" USING btree ("canonical_key","is_active");--> statement-breakpoint
CREATE INDEX "files_project_type_idx" ON "files" USING btree ("project_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "files_backblaze_key_unique" ON "files" USING btree ("backblaze_key");--> statement-breakpoint
CREATE INDEX "opus_jobs_video_key_idx" ON "opus_jobs" USING btree ("video_key");--> statement-breakpoint
CREATE INDEX "opus_jobs_user_idx" ON "opus_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "podcast_episodes_show_published_idx" ON "podcast_episodes" USING btree ("show_slug","published_at");--> statement-breakpoint
CREATE INDEX "podcast_shows_user_idx" ON "podcast_shows" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "projects_user_recorded_idx" ON "projects" USING btree ("user_id","recorded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_share_token_unique" ON "projects" USING btree ("share_token");--> statement-breakpoint
CREATE INDEX "publish_history_file_key_platform_idx" ON "publish_history" USING btree ("file_key","platform");--> statement-breakpoint
CREATE INDEX "publish_history_user_time_idx" ON "publish_history" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "reset_tokens_user_idx" ON "reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "revision_notes_revision_idx" ON "revision_notes" USING btree ("revision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "revisions_video_key_unique" ON "revisions" USING btree ("video_key");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transcripts_video_key_unique" ON "transcripts" USING btree ("video_key");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");