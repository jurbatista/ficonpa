import { Queue, type JobsOptions } from "bullmq";
import IORedis from "ioredis";

export const QUEUE_NAMES = {
  mailSync: "mail-sync",
  processDocument: "process-document",
  postPayable: "post-payable",
  purge: "purge-old",
  resolveLink: "resolve-link",
} as const;

/**
 * Links: o próprio resolvedor já repete o aprendizado internamente. A fila só
 * re-tenta quando o site está fora do ar (erro lançado de propósito), com espera longa.
 */
export const LINK_JOB_OPTIONS: JobsOptions = {
  attempts: 4,
  backoff: { type: "exponential", delay: 15 * 60_000 },
};

let connection: IORedis | null = null;
const queues = new Map<string, Queue>();

export function redisConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return connection;
}

export function getQueue(name: string): Queue {
  let queue = queues.get(name);
  if (!queue) {
    queue = new Queue(name, { connection: redisConnection() });
    queues.set(name, queue);
  }
  return queue;
}

export async function enqueue<T extends object>(
  name: string,
  data: T,
  options: JobsOptions = {},
): Promise<void> {
  await getQueue(name).add(name, data, {
    removeOnComplete: 500,
    removeOnFail: 500,
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    ...options,
  });
}
