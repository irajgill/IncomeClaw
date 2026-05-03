// apps/orchestrator/src/routes/brief.ts
//
// POST /brief — accept a brief, validate it, enqueue a BullMQ job, return
// the taskId. The mesh-runner worker (started in server.ts) consumes from
// the same queue.
//
// GET /brief/:taskId — read job status from BullMQ (for polling clients
// before the SSE feed lands in Phase D).

import { Hono } from 'hono';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import {
  BRIEF_QUEUE,
  type BriefJobData,
  type BriefJobResult,
} from '../queue.js';
import { logger } from '../logger.js';

const BriefBodySchema = z
  .object({
    brief: z.string().min(20, 'brief must be at least 20 characters').max(2000),
    callerAddress: z
      .string()
      .regex(/^0x[a-fA-F0-9]{40}$/)
      .optional(),
  })
  .strict();

/**
 * Build the /brief router. The queue is injected so tests can pass a mock
 * Queue or a Queue with a stubbed connection.
 */
export function buildBriefRouter(queue: Queue<BriefJobData, BriefJobResult>): Hono {
  const router = new Hono();

  router.post('/brief', async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = BriefBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        {
          error: 'BriefValidationError',
          issues: parsed.error.issues.map((i) => ({
            path: i.path,
            message: i.message,
          })),
        },
        400,
      );
    }

    const taskId = randomUUID();
    const data: BriefJobData = {
      brief: parsed.data.brief,
      taskId,
    };
    if (parsed.data.callerAddress) data.callerAddress = parsed.data.callerAddress;
    const job = await queue.add('brief', data, {
      jobId: taskId, // mirror taskId so replay rehydrates the same meshId
      removeOnComplete: { age: 86_400, count: 100 },
      removeOnFail: { age: 86_400 * 7 },
    });

    logger.info({ jobId: job.id, taskId, briefLen: parsed.data.brief.length }, 'brief enqueued');
    return c.json(
      {
        ok: true,
        taskId,
        queueName: BRIEF_QUEUE,
        statusUrl: `/brief/${taskId}`,
        feedUrl: `/feed/${taskId}`, // SSE feed comes online in Phase D
      },
      202,
    );
  });

  router.get('/brief/:taskId', async (c) => {
    const taskId = c.req.param('taskId');
    const job = await queue.getJob(taskId);
    if (!job) {
      return c.json({ error: 'JobNotFoundError', taskId }, 404);
    }
    const state = await job.getState();
    return c.json({
      taskId,
      state,
      progress: job.progress ?? null,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
      finishedOn: job.finishedOn ?? null,
      returnvalue: job.returnvalue ?? null,
      failedReason: job.failedReason ?? null,
    });
  });

  return router;
}
