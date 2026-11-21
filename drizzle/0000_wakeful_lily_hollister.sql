CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text DEFAULT 'application/pdf' NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"sha256" text NOT NULL,
	"path" text NOT NULL,
	"pages" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"entity" text,
	"entity_id" text,
	"payload" jsonb,
	"actor" text DEFAULT 'sistema' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text,
	"parent_id" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conta_azul_connection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_name" text,
	"access_token_enc" text NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"scope" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_centers_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attachment_id" uuid NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"is_boleto" boolean,
	"confidence" numeric(4, 3),
	"extraction" jsonb,
	"jev" jsonb,
	"match_method" text,
	"match_confidence" numeric(4, 3),
	"needs_attention" boolean DEFAULT false NOT NULL,
	"attention_reason" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"email" text NOT NULL,
	"host" text NOT NULL,
	"port" integer DEFAULT 993 NOT NULL,
	"secure" boolean DEFAULT true NOT NULL,
	"username" text NOT NULL,
	"password_enc" text NOT NULL,
	"folder" text DEFAULT 'INBOX' NOT NULL,
	"lookback_days" integer DEFAULT 30 NOT NULL,
	"uid_validity" text,
	"last_uid" bigint DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"message_id" text NOT NULL,
	"from_address" text,
	"subject" text,
	"received_at" timestamp with time zone,
	"raw_sha256" text,
	"status" text DEFAULT 'received' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_accounts_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"bank" text,
	"type" text,
	"active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"supplier_id" text,
	"supplier_name" text,
	"supplier_document" text,
	"category_id" text,
	"category_name" text,
	"financial_account_id" text,
	"financial_account_name" text,
	"cost_center_id" text,
	"cost_center_name" text,
	"value" numeric(14, 2),
	"due_date" date,
	"competence_date" date,
	"description" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"origin" text DEFAULT 'manual' NOT NULL,
	"referencia_externa" text NOT NULL,
	"conta_azul_event_id" text,
	"posted_at" timestamp with time zone,
	"posted_by" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"document" text,
	"email" text,
	"profiles" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text DEFAULT 'global' NOT NULL,
	"supplier_id" text,
	"supplier_name" text,
	"keyword" text,
	"category_id" text,
	"category_name" text,
	"financial_account_id" text,
	"financial_account_name" text,
	"cost_center_id" text,
	"cost_center_name" text,
	"priority" integer DEFAULT 100 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_message_id_email_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."email_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_account_id_email_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."email_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payables" ADD CONSTRAINT "payables_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attachments_sha256_uq" ON "attachments" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "attachments_created_idx" ON "attachments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_log_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "documents_created_idx" ON "documents" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "documents_status_idx" ON "documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "email_accounts_active_idx" ON "email_accounts" USING btree ("active");--> statement-breakpoint
CREATE UNIQUE INDEX "email_messages_account_message_uq" ON "email_messages" USING btree ("account_id","message_id");--> statement-breakpoint
CREATE INDEX "email_messages_created_idx" ON "email_messages" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payables_referencia_uq" ON "payables" USING btree ("referencia_externa");--> statement-breakpoint
CREATE INDEX "payables_created_idx" ON "payables" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "payables_posted_idx" ON "payables" USING btree ("posted_at");--> statement-breakpoint
CREATE INDEX "payables_status_idx" ON "payables" USING btree ("status");