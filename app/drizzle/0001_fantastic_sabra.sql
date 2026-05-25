CREATE TABLE "vizard_jobs" (
	"project_id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"video_key" text NOT NULL,
	"session_context" text,
	"prefer_length" integer DEFAULT 0 NOT NULL,
	"status" "opus_job_status" DEFAULT 'queued' NOT NULL,
	"clips_delivered" integer DEFAULT 0 NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "vizard_jobs" ADD CONSTRAINT "vizard_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vizard_jobs_video_key_idx" ON "vizard_jobs" USING btree ("video_key");--> statement-breakpoint
CREATE INDEX "vizard_jobs_user_idx" ON "vizard_jobs" USING btree ("user_id");