CREATE TABLE "yt_ai_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"video_id" varchar(16) NOT NULL,
	"url" text NOT NULL,
	"video_title" text,
	"channel" text,
	"cover_url" text,
	"transcript" text,
	"segments_done" integer DEFAULT 0 NOT NULL,
	"transcript_complete" boolean DEFAULT false NOT NULL,
	"ai" jsonb,
	"articles" jsonb,
	"thumbnails" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "yt_ai_jobs" ADD CONSTRAINT "yt_ai_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "yt_ai_jobs_user_idx" ON "yt_ai_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "yt_ai_jobs_created_idx" ON "yt_ai_jobs" USING btree ("created_at");