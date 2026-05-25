CREATE TABLE "studio_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_slug" text NOT NULL,
	"token" text NOT NULL,
	"label" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "studios" ADD COLUMN "payment_link_url" text;--> statement-breakpoint
CREATE UNIQUE INDEX "studio_invites_token_unique" ON "studio_invites" USING btree ("token");--> statement-breakpoint
CREATE INDEX "studio_invites_slug_idx" ON "studio_invites" USING btree ("studio_slug");