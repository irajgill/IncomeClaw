// scripts/smoke-tavily.ts
//
// Phase A Tavily integration smoke. Confirms TAVILY_API_KEY works and the
// wrapper returns 3 real results. Per IncomeClaw-Roadmap.md §1.6.
//
// This is the *only* non-0G external service in IncomeClaw's pipeline, and
// it's a search index, not an LLM (so working agreement #14 stands).

import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import { pino } from 'pino';
import { webSearch } from '../agents/src/web-search.js';
import { WebSearchError } from '../agents/src/errors.js';

const log = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l' } },
});

const QUERY = '0G Labs ETHGlobal hackathon 2026';

async function main() {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey || apiKey === 'tvly-replace-me' || apiKey.length < 8) {
    log.error('TAVILY_API_KEY missing or placeholder. Get one at https://tavily.com.');
    process.exit(1);
  }

  log.info({ query: QUERY }, 'Querying Tavily…');
  const start = Date.now();

  let response;
  try {
    response = await webSearch(
      { query: QUERY, maxResults: 3, searchDepth: 'basic' },
      { apiKey, timeoutMs: 8_000, retries: 1 },
    );
  } catch (e) {
    if (e instanceof WebSearchError) {
      log.error({ status: e.status, err: e.message }, 'WebSearchError');
    } else {
      log.error({ err: e }, 'unexpected error');
    }
    process.exit(1);
  }

  const elapsedMs = Date.now() - start;

  if (!response.results.length) {
    log.error({ response }, 'Tavily returned 0 results — key may be valid but quota exhausted.');
    process.exit(1);
  }

  log.info({ elapsedMs, count: response.results.length }, 'Tavily OK');
  for (const [i, r] of response.results.entries()) {
    log.info({ rank: i + 1, score: r.score, url: r.url }, `  ${i + 1}. ${r.title}`);
  }

  await writeFile(
    'scripts/smoke-tavily.last.json',
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        query: QUERY,
        elapsedMs,
        count: response.results.length,
        // Keep the snippet titles + urls so the report is greppable;
        // omit `content` since it's verbose.
        results: response.results.map((r) => ({ title: r.title, url: r.url, score: r.score })),
      },
      null,
      2,
    ),
  );
  log.info('Report written to scripts/smoke-tavily.last.json.');
}

main().catch((e) => {
  log.error({ err: e }, 'unhandled');
  process.exit(1);
});
