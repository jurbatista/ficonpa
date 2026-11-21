import { Queue, type JobsOptions } from "bullmq";
import IORedis from "ioredis";

export const QUEUE_NAMES = {
  mailSync: "mail-sync",
  processDocument: "process-document",
  postPayable: "post-payable",
  purge: "purge-old",
} as const;

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
