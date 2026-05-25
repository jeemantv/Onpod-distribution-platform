CREATE TABLE "vizard_template_overrides" (
	"template_id" text PRIMARY KEY NOT NULL,
	"name" text,
	"preview_key" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
