import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { loadEnv } from './env.js';
import { logger } from './logger.js';
import { buildBriefQueue, buildRedisConnection } from './queue.js';
import { buildBriefRouter } from './routes/brief.js';
import { startMeshRunner } from './workers/mesh-runner.js';
import type { Worker, Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import type { BriefJobData, BriefJobResult } from './queue.js';

const env = loadEnv();
const app = new Hono();

app.get('/healthz', (c) => c.json({ ok: true, service: 'orchestrator', version: '0.1.0' }));

let worker: Worker<BriefJobData, BriefJobResult> | null = null;
let queueConnection: Redis | null = null;
let queue: Queue<BriefJobData, BriefJobResult> | null = null;

if (env.ENABLE_MESH) {
  // Producer-side queue (used by /brief route).
  queueConnection = buildRedisConnection();
  queue = buildBriefQueue(queueConnection);
  app.route('/', buildBriefRouter(queue));

  // Consumer-side worker. Owns its own Redis connection internally.
  try {
    worker = startMeshRunner();
    logger.info('mesh-runner worker started');
  } catch (err) {
    logger.error(
      { err },
      'mesh-runner failed to start; /brief enqueue will work but jobs will not be consumed',
    );
  }
} else {
  logger.warn('ENABLE_MESH=0 — /brief route and mesh-runner are disabled (healthz only)');
}

const server = serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    logger.info({ port: info.port, mesh: env.ENABLE_MESH }, 'orchestrator listening');
  },
);

const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, 'shutting down');
  await Promise.allSettled([worker?.close(), queue?.close()]);
  if (queueConnection) {
    await queueConnection.quit().catch(() => undefined);
  }
  server.close(() => process.exit(0));
};
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
