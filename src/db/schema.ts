import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** Contas de e-mail conectadas via IMAP. */
export const emailAccounts = pgTable(
  "email_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    label: text("label").notNull(),
    email: text("email").notNull(),
    host: text("host").notNull(),
    port: integer("port").notNull().default(993),
    secure: boolean("secure").notNull().default(true),
    username: text("username").notNull(),
    passwordEnc: text("password_enc").notNull(),
    /** "password" (senha/senha de app) ou "microsoft" (OAuth2 / XOAUTH2). */
    authType: text("auth_type").notNull().default("password"),
    provider: text("provider"),
    oauthRefreshEnc: text("oauth_refresh_enc"),
    oauthAccessEnc: text("oauth_access_enc"),
    oauthExpiresAt: timestamp("oauth_expires_at", { withTimezone: true }),
    folder: text("folder").notNull().default("INBOX"),
    lookbackDays: integer("lookback_days").notNull().default(30),
    uidValidity: text("uid_validity"),
    lastUid: bigint("last_uid", { mode: "number" }).notNull().default(0),
    active: boolean("active").notNull().default(true),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("email_accounts_active_idx").on(t.active)],
);

/** Mensagens já vistas, para deduplicação. */
export const emailMessages = pgTable(
  "email_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => emailAccounts.id, { onDelete: "cascade" }),
    messageId: text("message_id").notNull(),
    fromAddress: text("from_address"),
    subject: text("subject"),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    rawSha256: text("raw_sha256"),
    status: text("status").notNull().default("received"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("email_messages_account_message_uq").on(t.accountId, t.messageId),
    index("email_messages_created_idx").on(t.createdAt),
  ],
);

/** Anexos PDF extraídos das mensagens. */
export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => emailMessages.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull().default("application/pdf"),
    size: integer("size").notNull().default(0),
    sha256: text("sha256").notNull(),
    path: text("path").notNull(),
    pages: integer("pages"),
    /** "email" = anexo do e-mail; "link" = PDF baixado a partir de um link no corpo. */
    source: text("source").notNull().default("email"),
    sourceUrl: text("source_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("attachments_sha256_uq").on(t.sha256),
    index("attachments_created_idx").on(t.createdAt),
  ],
);

/**
 * Links de cobrança encontrados no corpo dos e-mails. Só a URL é guardada;
 * o corpo do e-mail continua sem ser armazenado.
 *
 * status: PENDING | RESOLVING | RESOLVED | CAPTCHA | UNAVAILABLE | NOT_FOUND | FAILED
 */
export const emailLinks = pgTable(
  "email_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** null = link testado manualmente pela tela "Links". */
    messageId: uuid("message_id").references(() => emailMessages.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    finalUrl: text("final_url"),
    host: text("host"),
    anchorText: text("anchor_text"),
    status: text("status").notNull().default("PENDING"),
    method: text("method"), // recipe | learned | relearned
    recipeId: uuid("recipe_id"),
    attachmentId: uuid("attachment_id"),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    trace: jsonb("trace"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("email_links_message_url_uq").on(t.messageId, t.url),
    index("email_links_status_idx").on(t.status),
    index("email_links_created_idx").on(t.createdAt),
  ],
);

/**
 * Caminho aprendido para chegar ao PDF do boleto a partir de um link.
 * Uma receita vale para um host + padrão de caminho (ex.: gerencianet.com.br /emissao/{id}).
 * steps é uma lista declarativa de passos (ver src/lib/links/recipe.ts) — nunca código.
 */
export const linkRecipes = pgTable(
  "link_recipes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    host: text("host").notNull(),
    pathPattern: text("path_pattern").notNull(),
    steps: jsonb("steps").notNull(),
    exampleUrl: text("example_url"),
    active: boolean("active").notNull().default(true),
    version: integer("version").notNull().default(1),
    successCount: integer("success_count").notNull().default(0),
    failureCount: integer("failure_count").notNull().default(0),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("link_recipes_host_pattern_uq").on(t.host, t.pathPattern)],
);

/**
 * Documento processado (um PDF). Só entra na tela principal se
 * status = READY | POSTED | REJECTED. Os demais ficam registrados
 * apenas para diagnóstico e são purgados pela retenção.
 */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attachmentId: uuid("attachment_id")
      .notNull()
      .references(() => attachments.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("PENDING"),
    isBoleto: boolean("is_boleto"),
    confidence: numeric("confidence", { precision: 4, scale: 3 }),
    extraction: jsonb("extraction"),
    jev: jsonb("jev"),
    matchMethod: text("match_method"),
    matchConfidence: numeric("match_confidence", { precision: 4, scale: 3 }),
    needsAttention: boolean("needs_attention").notNull().default(false),
    attentionReason: text("attention_reason"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("documents_created_idx").on(t.createdAt), index("documents_status_idx").on(t.status)],
);

/** Fila de contas a pagar / lançamentos. */
export const payables = pgTable(
  "payables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    supplierId: text("supplier_id"),
    supplierName: text("supplier_name"),
    supplierDocument: text("supplier_document"),
    categoryId: text("category_id"),
    categoryName: text("category_name"),
    financialAccountId: text("financial_account_id"),
    financialAccountName: text("financial_account_name"),
    costCenterId: text("cost_center_id"),
    costCenterName: text("cost_center_name"),
    value: numeric("value", { precision: 14, scale: 2 }),
    dueDate: date("due_date"),
    competenceDate: date("competence_date"),
    description: text("description"),
    status: text("status").notNull().default("DRAFT"),
    origin: text("origin").notNull().default("manual"),
    referenciaExterna: text("referencia_externa").notNull(),
    contaAzulEventId: text("conta_azul_event_id"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    postedBy: text("posted_by"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payables_referencia_uq").on(t.referenciaExterna),
    index("payables_created_idx").on(t.createdAt),
    index("payables_posted_idx").on(t.postedAt),
    index("payables_status_idx").on(t.status),
  ],
);

/** Conexão OAuth com o Conta Azul (uma empresa). */
export const contaAzulConnection = pgTable("conta_azul_connection", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyName: text("company_name"),
  accessTokenEnc: text("access_token_enc").notNull(),
  refreshTokenEnc: text("refresh_token_enc").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  scope: text("scope"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Caches dos cadastros do Conta Azul. */
export const peopleCache = pgTable("people_cache", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  document: text("document"),
  email: text("email"),
  profiles: jsonb("profiles"),
  active: boolean("active").notNull().default(true),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
});

export const categoriesCache = pgTable("categories_cache", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type"),
  parentId: text("parent_id"),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
});

export const financialAccountsCache = pgTable("financial_accounts_cache", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  bank: text("bank"),
  type: text("type"),
  active: boolean("active").notNull().default(true),
  isDefault: boolean("is_default").notNull().default(false),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
});

export const costCentersCache = pgTable("cost_centers_cache", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Regras de classificação contábil. */
export const rules = pgTable("rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  scope: text("scope").notNull().default("global"), // global | supplier | keyword
  supplierId: text("supplier_id"),
  supplierName: text("supplier_name"),
  keyword: text("keyword"),
  categoryId: text("category_id"),
  categoryName: text("category_name"),
  financialAccountId: text("financial_account_id"),
  financialAccountName: text("financial_account_name"),
  costCenterId: text("cost_center_id"),
  costCenterName: text("cost_center_name"),
  priority: integer("priority").notNull().default(100),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Configurações chave/valor. */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Auditoria de ações sensíveis. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    action: text("action").notNull(),
    entity: text("entity"),
    entityId: text("entity_id"),
    payload: jsonb("payload"),
    actor: text("actor").notNull().default("sistema"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_created_idx").on(t.createdAt)],
);

export type EmailAccount = typeof emailAccounts.$inferSelect;
export type DocumentRow = typeof documents.$inferSelect;
export type PayableRow = typeof payables.$inferSelect;
export type ContaAzulConnectionRow = typeof contaAzulConnection.$inferSelect;
export type EmailLinkRow = typeof emailLinks.$inferSelect;
export type LinkRecipeRow = typeof linkRecipes.$inferSelect;
