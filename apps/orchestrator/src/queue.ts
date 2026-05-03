// apps/orchestrator/src/queue.ts
//
// Single source of truth for the brief queue name + connection options.
// BullMQ queues and workers must agree on both, so they live in one file.

import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { Redis } from 'ioredis';
import { loadEnv } from './env.js';

export const BRIEF_QUEUE = 'incomeclaw.brief';

/** Per-task input the producer (POST /brief) hands to the worker. */
export interface BriefJobData {
  /** The brief text. Free-form English; the model decides what to do with it. */
  brief: string;
  /** Stable task id. Mirrors the BullMQ jobId so dashboards can join. */
  taskId: string;
  /** Caller wallet, if known. Optional. */
  callerAddress?: string;
}

/** What the worker writes back to the job result so /brief return values stay typed. */
export interface BriefJobResult {
  taskId: string;
  meshId: string;
  acceptedOutput: string;
  operatorOutput: string;
  busEventPointers: string[];
  pec: { rounds: number; score: number; acceptedExecutor: string };
  /** ms from job pickup to mesh.close(). */
  totalMs: number;
}

/**
 * Build a Redis connection that BullMQ accepts as a `ConnectionOptions`.
 * BullMQ wants `maxRetriesPerRequest: null` on its connection (so blocked
 * commands don't timeout under contention). Caller owns disconnect.
 */
export function buildRedisConnection(): Redis {
  const env = loadEnv();
  const conn = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  return conn;
}

/** Producer-side queue handle. Caller owns close(). */
export function buildBriefQueue(connection: ConnectionOptions): Queue<BriefJobData, BriefJobResult> {
  return new Queue<BriefJobData, BriefJobResult>(BRIEF_QUEUE, { connection });
}

export type { Worker };
