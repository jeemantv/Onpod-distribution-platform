CREATE TABLE "session_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"studio_slug" text NOT NULL,
	"bucket" text NOT NULL,
	"folder" text NOT NULL,
	"done_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "session_states_identity_unique" ON "session_states" USING btree ("studio_slug","bucket","folder");