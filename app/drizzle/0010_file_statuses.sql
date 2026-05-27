CREATE TABLE "file_statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_slug" text NOT NULL,
	"label" text NOT NULL,
	"color" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"legacy_value" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "file_meta" ADD COLUMN "status_id" uuid;--> statement-breakpoint
CREATE INDEX "file_statuses_studio_pos_idx" ON "file_statuses" USING btree ("studio_slug","position");