CREATE TABLE "account_delegates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"email" varchar(320) NOT NULL,
	"name" varchar(200) NOT NULL,
	"label" varchar(80),
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "account_delegates" ADD CONSTRAINT "account_delegates_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_delegates_owner_idx" ON "account_delegates" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_delegates_token_unique" ON "account_delegates" USING btree ("token");