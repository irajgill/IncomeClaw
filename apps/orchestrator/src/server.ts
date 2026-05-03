import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { loadEnv } from './env.js';
import { logger } from './logger.js';

const env = loadEnv();
const app = new Hono();

app.get('/healthz', (c) => c.json({ ok: true, service: 'orchestrator', version: '0.1.0' }));

const server = serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    logger.info({ port: info.port }, 'orchestrator listening');
  },
);

const shutdown = (signal: string) => {
  logger.info({ signal }, 'shutting down');
  server.close(() => process.exit(0));
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
