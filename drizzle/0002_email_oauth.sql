ALTER TABLE "email_accounts" ADD COLUMN "auth_type" text DEFAULT 'password' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_accounts" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "email_accounts" ADD COLUMN "oauth_refresh_enc" text;--> statement-breakpoint
ALTER TABLE "email_accounts" ADD COLUMN "oauth_access_enc" text;--> statement-breakpoint
ALTER TABLE "email_accounts" ADD COLUMN "oauth_expires_at" timestamp with time zone;