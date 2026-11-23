import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { redisConnection } from "@/lib/queue";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { attachmentDir } from "@/lib/env";

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

  try {
    const dir = attachmentDir();
    await mkdir(dir, { recursive: true });
    const probe = path.join(dir, `.health-${process.pid}`);
    await writeFile(probe, "ok");
    await unlink(probe);
    checks.storage = "ok";
  } catch (error) {
    healthy = false;
    checks.storage = error instanceof Error ? error.message : "erro";
  }

  try {
    const beat = await readFile(path.join(path.dirname(attachmentDir()), ".worker-heartbeat"), "utf8");
    const age = Math.round((Date.now() - new Date(beat.trim()).getTime()) / 1000);
    if (age > 180) {
      healthy = false;
      checks.worker = `sem sinal há ${age}s`;
    } else {
      checks.worker = "ok";
    }
  } catch {
    healthy = false;
    checks.worker = "sem sinal do worker (parado ou sem acesso ao volume compartilhado)";
  }

  return NextResponse.json(
    { ok: healthy, checks, timestamp: new Date().toISOString() },
    { status: healthy ? 200 : 503 },
  );
}
