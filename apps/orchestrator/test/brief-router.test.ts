// Unit tests for the /brief router. Uses a fake Queue so no Redis or
// BullMQ machinery is required.

import { describe, expect, it, vi } from 'vitest';
import type { Queue } from 'bullmq';
import { buildBriefRouter } from '../src/routes/brief.js';
import type { BriefJobData, BriefJobResult } from '../src/queue.js';

function fakeQueue(overrides: Partial<Queue<BriefJobData, BriefJobResult>> = {}) {
  const added: Array<{
    name: string;
    data: BriefJobData;
    opts: { jobId: string };
  }> = [];
  const queue = {
    add: vi.fn(async (name: string, data: BriefJobData, opts: { jobId: string }) => {
      added.push({ name, data, opts });
      return { id: opts.jobId } as { id: string };
    }),
    getJob: vi.fn(),
    ...overrides,
  } as unknown as Queue<BriefJobData, BriefJobResult>;
  return { queue, added };
}

async function postBrief(router: ReturnType<typeof buildBriefRouter>, body: unknown): Promise<Response> {
  return router.fetch(
    new Request('http://test/brief', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

describe('POST /brief', () => {
  it('rejects bodies that fail validation (too short)', async () => {
    const { queue, added } = fakeQueue();
    const router = buildBriefRouter(queue);
    const res = await postBrief(router, { brief: 'too short' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('BriefValidationError');
    expect(added).toHaveLength(0);
  });

  it('rejects bodies missing brief', async () => {
    const { queue } = fakeQueue();
    const router = buildBriefRouter(queue);
    const res = await postBrief(router, {});
    expect(res.status).toBe(400);
  });

  it('rejects malformed callerAddress', async () => {
    const { queue } = fakeQueue();
    const router = buildBriefRouter(queue);
    const res = await postBrief(router, {
      brief: 'a'.repeat(50),
      callerAddress: '0xnotanaddress',
    });
    expect(res.status).toBe(400);
  });

  it('enqueues a job and returns 202 with taskId + statusUrl', async () => {
    const { queue, added } = fakeQueue();
    const router = buildBriefRouter(queue);
    const res = await postBrief(router, {
      brief: 'Find a software vendor for AI ops automation in mid-market manufacturing.',
    });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.taskId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.statusUrl).toBe(`/brief/${body.taskId}`);
    expect(body.feedUrl).toBe(`/feed/${body.taskId}`);
    expect(added).toHaveLength(1);
    expect(added[0]!.opts.jobId).toBe(body.taskId);
    expect(added[0]!.data.brief.length).toBeGreaterThan(20);
  });

  it('uses the same jobId/taskId so replay rehydrates the same meshId', async () => {
    const { queue, added } = fakeQueue();
    const router = buildBriefRouter(queue);
    const res = await postBrief(router, {
      brief: 'a'.repeat(50),
    });
    const body = await res.json();
    expect(added[0]!.opts.jobId).toBe(body.taskId);
  });

  it('removeOnComplete and removeOnFail are configured (memory hygiene)', async () => {
    const { queue, added } = fakeQueue();
    const router = buildBriefRouter(queue);
    await postBrief(router, { brief: 'a'.repeat(50) });
    const opts = added[0]!.opts as Record<string, unknown>;
    expect(opts.removeOnComplete).toBeDefined();
    expect(opts.removeOnFail).toBeDefined();
  });
});

describe('GET /brief/:taskId', () => {
  it('returns 404 when no such job', async () => {
    const { queue } = fakeQueue({
      getJob: vi.fn(async () => null) as unknown as Queue['getJob'],
    });
    const router = buildBriefRouter(queue);
    const res = await router.fetch(new Request('http://test/brief/nonexistent'));
    expect(res.status).toBe(404);
  });

  it('returns job state when found', async () => {
    const { queue } = fakeQueue({
      getJob: vi.fn(async () => ({
        getState: async () => 'completed',
        progress: 100,
        attemptsMade: 1,
        timestamp: 1_700_000_000_000,
        finishedOn: 1_700_000_010_000,
        returnvalue: { taskId: 'x', meshId: 'x' },
        failedReason: null,
      })) as unknown as Queue['getJob'],
    });
    const router = buildBriefRouter(queue);
    const res = await router.fetch(new Request('http://test/brief/abc'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.state).toBe('completed');
    expect(body.attemptsMade).toBe(1);
  });
});
