CREATE TABLE "post_bucket_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bucket_id" uuid NOT NULL,
	"file_key" text NOT NULL,
	"file_name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"post_count" integer DEFAULT 0 NOT NULL,
	"last_posted_at" timestamp with time zone,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_buckets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"channel_id" text NOT NULL,
	"channel_title" text,
	"visibility" text DEFAULT 'public' NOT NULL,
	"times" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"days" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"title_template" text,
	"active" boolean DEFAULT true NOT NULL,
	"cursor" integer DEFAULT 0 NOT NULL,
	"last_slot_key" text,
	"last_posted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "post_bucket_items" ADD CONSTRAINT "post_bucket_items_bucket_id_post_buckets_id_fk" FOREIGN KEY ("bucket_id") REFERENCES "public"."post_buckets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_buckets" ADD CONSTRAINT "post_buckets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "post_bucket_items_bucket_idx" ON "post_bucket_items" USING btree ("bucket_id");--> statement-breakpoint
CREATE UNIQUE INDEX "post_bucket_items_bucket_file_unique" ON "post_bucket_items" USING btree ("bucket_id","file_key");--> statement-breakpoint
CREATE INDEX "post_buckets_user_idx" ON "post_buckets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "post_buckets_active_idx" ON "post_buckets" USING btree ("active");