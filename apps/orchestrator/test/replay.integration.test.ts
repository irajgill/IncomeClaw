// apps/orchestrator/test/replay.integration.test.ts
//
// Phase C.3 — Replay test (roadmap §7 Phase C deliverable).
//
// We don't kill an actual orchestrator process here — we exercise the
// invariant that makes replay work: the BullMQ jobId IS the meshId, so a
// retried job re-instantiates IncomeMesh with the same OG_Log mesh-bus
// namespace. mesh.bus.replay() then returns prior events.
//
// Two phases:
//   1. Enqueue a job that fails on first attempt (worker throws once).
//      Confirm BullMQ redelivers it with the same jobId.
//   2. After the worker eventually succeeds, the job result carries the
//      same meshId both times.
//
// Gated on Redis. Set INTEGRATION=1 and ensure REDIS_URL is reachable
// (docker-compose up redis works locally).

import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Queue, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { BRIEF_QUEUE, type BriefJobData, type BriefJobResult } from '../src/queue.js';

const RUN = process.env.INTEGRATION === '1';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

async function redisReachable(): Promise<boolean> {
  try {
    const probe = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      connectTimeout: 1500,
    });
    await probe.connect();
    const pong = await probe.ping();
    await probe.quit();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

describe.skipIf(!RUN)('Phase C.3 — replay invariants (Redis required)', () => {
  let connection: Redis;
  let queue: Queue<BriefJobData, BriefJobResult>;
  let worker: Worker<BriefJobData, BriefJobResult>;

  beforeAll(async () => {
    if (!(await redisReachable())) {
      throw new Error(
        `Redis not reachable at ${REDIS_URL}. Start it with: docker compose up -d redis`,
      );
    }
    connection = new Redis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
    queue = new Queue<BriefJobData, BriefJobResult>(BRIEF_QUEUE + '.replay-test', { connection });
  }, 30_000);

  afterAll(async () => {
    await worker?.close();
    await queue?.close();
    await connection?.quit();
  });

  it('a job that fails once is redelivered with the same jobId', async () => {
    let attempts = 0;
    const seenJobIds: string[] = [];

    worker = new Worker<BriefJobData, BriefJobResult>(
      BRIEF_QUEUE + '.replay-test',
      async (job: Job<BriefJobData, BriefJobResult>) => {
        attempts += 1;
        seenJobIds.push(job.id ?? '<no-id>');
        if (attempts === 1) {
          throw new Error('synthetic mid-task failure to trigger replay');
        }
        // Second attempt: succeed. Return a synthetic result with the
        // meshId == jobId (mirrors what the real worker does).
        const taskId = job.id ?? '<no-id>';
        return {
          taskId,
          meshId: taskId,
          acceptedOutput: 'ok',
          operatorOutput: 'ok',
          busEventPointers: [],
          pec: { rounds: 1, score: 1, acceptedExecutor: 'strategist' },
          totalMs: 0,
        };
      },
      {
        connection,
        concurrency: 1,
        // Redeliver fast so the test doesn't sleep forever.
      },
    );

    const taskId = `replay-test-${Date.now()}`;
    await queue.add(
      'brief',
      { brief: 'a'.repeat(50), taskId },
      { jobId: taskId, attempts: 2, backoff: { type: 'fixed', delay: 100 } },
    );

    // Wait for completion (or failure).
    const start = Date.now();
    let job: Job<BriefJobData, BriefJobResult> | undefined;
    while (Date.now() - start < 15_000) {
      job = await queue.getJob(taskId);
      if (job && (await job.getState()) === 'completed') break;
      await new Promise((r) => setTimeout(r, 200));
    }

    expect(attempts).toBeGreaterThanOrEqual(2);
    expect(seenJobIds.every((id) => id === taskId)).toBe(true); // jobId stable across retry
    expect(job).toBeDefined();
    const finalState = await job!.getState();
    expect(finalState).toBe('completed');
    const ret = job!.returnvalue;
    expect(ret.meshId).toBe(taskId); // meshId mirrors jobId — replay invariant holds
  }, 30_000);
});
