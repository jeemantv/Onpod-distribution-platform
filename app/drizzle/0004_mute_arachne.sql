ALTER TABLE "users" ADD COLUMN "home_studio" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "self_upload_enabled" boolean DEFAULT false NOT NULL;