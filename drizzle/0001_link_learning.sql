CREATE TABLE "email_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid,
	"url" text NOT NULL,
	"final_url" text,
	"host" text,
	"anchor_text" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"method" text,
	"recipe_id" uuid,
	"attachment_id" uuid,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"trace" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "link_recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host" text NOT NULL,
	"path_pattern" text NOT NULL,
	"steps" jsonb NOT NULL,
	"example_url" text,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "source" text DEFAULT 'email' NOT NULL;--> statement-breakpoint
ALTER TABLE "attachments" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "email_links" ADD CONSTRAINT "email_links_message_id_email_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."email_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_links_message_url_uq" ON "email_links" USING btree ("message_id","url");--> statement-breakpoint
CREATE INDEX "email_links_status_idx" ON "email_links" USING btree ("status");--> statement-breakpoint
CREATE INDEX "email_links_created_idx" ON "email_links" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "link_recipes_host_pattern_uq" ON "link_recipes" USING btree ("host","path_pattern");