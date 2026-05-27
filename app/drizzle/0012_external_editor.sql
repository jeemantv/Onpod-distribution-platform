ALTER TABLE "users" ADD COLUMN "external_editor_email" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "external_editor_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "external_editor_token" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "external_editor_revoked_at" timestamp with time zone;