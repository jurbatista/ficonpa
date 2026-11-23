import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { settings } from "@/db/schema";

export type AppSettings = {
  autoPostEnabled: boolean;
  autoPostThreshold: number;
  reviewThreshold: number;
  retentionDays: number;
  purgeHour: number;
  jevEnabled: boolean;
  jevModel: string;
  qwenModel: string;
  linkResolverEnabled: boolean;
  linkAgentModel: string;
  linkLearningAttempts: number;
};

export const DEFAULT_SETTINGS: AppSettings = {
  autoPostEnabled: false,
  autoPostThreshold: 0.95,
  reviewThreshold: 0.8,
  retentionDays: 90,
  purgeHour: 3,
  jevEnabled: true,
  jevModel: process.env.JEV_MODEL ?? "typesafe/jev-1.14",
  qwenModel: process.env.OPENROUTER_MODEL ?? "qwen/qwen3-vl-235b-a22b-instruct",
  linkResolverEnabled: true,
  linkAgentModel:
    process.env.LINK_AGENT_MODEL ?? process.env.OPENROUTER_MODEL ?? "qwen/qwen3-vl-235b-a22b-instruct",
  linkLearningAttempts: 3,
};

const KEY_MAP: Record<keyof AppSettings, string> = {
  autoPostEnabled: "auto_post_enabled",
  autoPostThreshold: "auto_post_threshold",
  reviewThreshold: "review_threshold",
  retentionDays: "retention_days",
  purgeHour: "purge_hour",
  jevEnabled: "jev_enabled",
  jevModel: "jev_model",
  qwenModel: "qwen_model",
  linkResolverEnabled: "link_resolver_enabled",
  linkAgentModel: "link_agent_model",
  linkLearningAttempts: "link_learning_attempts",
};

export async function getSettings(): Promise<AppSettings> {
  const rows = await getDb().select().from(settings);
  const result: AppSettings = { ...DEFAULT_SETTINGS };
  for (const [key, dbKey] of Object.entries(KEY_MAP) as [keyof AppSettings, string][]) {
    const row = rows.find((item) => item.key === dbKey);
    if (row && row.value !== null && row.value !== undefined) {
      // @ts-expect-error atribuição dinâmica validada pelo tipo do default
      result[key] = row.value;
    }
  }
  return result;
}

export async function updateSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
  const db = getDb();
  for (const [key, value] of Object.entries(partial) as [keyof AppSettings, unknown][]) {
    if (value === undefined) continue;
    const dbKey = KEY_MAP[key];
    await db
      .insert(settings)
      .values({ key: dbKey, value: value as never, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: value as never, updatedAt: new Date() },
      });
  }
  return getSettings();
}

export async function getSetting<T>(key: string): Promise<T | null> {
  const [row] = await getDb().select().from(settings).where(eq(settings.key, key)).limit(1);
  return (row?.value as T) ?? null;
}
