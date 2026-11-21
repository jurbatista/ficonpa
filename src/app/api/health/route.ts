import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { redisConnection } from "@/lib/queue";

export async function GET() {
  const checks: Record<string, string> = {};
  let healthy = true;

  try {
    await getDb().execute(sql`select 1`);
    checks.database = "ok";
  } catch (error) {
    healthy = false;
    checks.database = error instanceof Error ? error.message : "erro";
  }

  try {
    const pong = await redisConnection().ping();
    checks.redis = pong === "PONG" ? "ok" : pong;
  } catch (error) {
    healthy = false;
    checks.redis = error instanceof Error ? error.message : "erro";
  }

  return NextResponse.json(
    { ok: healthy, checks, timestamp: new Date().toISOString() },
    { status: healthy ? 200 : 503 },
  );
}
