// agents/src/web-search.ts
//
// Tavily Search wrapper used by the Brain and Strategist agents (Phase C)
// and exercised by scripts/smoke-tavily.ts (Phase A).
//
// Per IncomeClaw-Roadmap.md §1.6 + §13 working agreements #8 (timeouts +
// retry) and #9 (typed errors), this wrapper:
//   • Sets an AbortController-driven 8 s timeout (no Promise.race).
//   • Retries ONCE on transient errors (5xx + AbortError).
//   • Fails fast on 401/403 with a clear pointer to https://tavily.com.
//   • Throws WebSearchError (defined in agents/src/errors.ts) with the
//     upstream HTTP status when known.

import { WebSearchError } from './errors.js';

export const TAVILY_DEFAULT_ENDPOINT = 'https://api.tavily.com/search';

export interface TavilySearchInput {
  query: string;
  maxResults?: number;
  /** Tavily search depth — basic is faster + cheaper. */
  searchDepth?: 'basic' | 'advanced';
  /** Tavily-side LLM-summarized direct answer. We default OFF to keep it lean. */
  includeAnswer?: boolean;
}

export interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
  /** Present only when includeRawContent is true at request time. */
  raw_content?: string | null;
}

export interface TavilySearchResponse {
  query: string;
  results: TavilyResult[];
  /** Present only when includeAnswer is true. */
  answer?: string;
  response_time?: number;
}

export interface WebSearchOptions {
  apiKey: string;
  endpoint?: string;
  /** AbortController timeout for the whole call, including the one retry. */
  timeoutMs?: number;
  /** Retries on transient failures (5xx + AbortError). Default 1. */
  retries?: number;
  /** Backoff before the retry, in ms. Default 750ms. */
  retryBackoffMs?: number;
  /** Inject a fetch implementation for tests. */
  fetchImpl?: typeof fetch;
}

const TRANSIENT_STATUSES = new Set([502, 503, 504]);

/**
 * Search the web via Tavily. Returns 1–10 ranked results.
 *
 * @throws {WebSearchError} on invalid input, auth failure, timeout exhaustion,
 *                          non-transient HTTP errors, or schema-violating
 *                          response bodies.
 */
export async function webSearch(
  input: TavilySearchInput,
  options: WebSearchOptions,
): Promise<TavilySearchResponse> {
  if (!input.query || input.query.trim().length < 3) {
    throw new WebSearchError('query must be at least 3 characters');
  }
  const maxResults = input.maxResults ?? 5;
  if (maxResults < 1 || maxResults > 10) {
    throw new WebSearchError('maxResults must be between 1 and 10');
  }

  const endpoint = options.endpoint ?? TAVILY_DEFAULT_ENDPOINT;
  const timeoutMs = options.timeoutMs ?? 8_000;
  const retries = options.retries ?? 1;
  const backoffMs = options.retryBackoffMs ?? 750;
  const doFetch = options.fetchImpl ?? fetch;

  const body = JSON.stringify({
    api_key: options.apiKey,
    query: input.query,
    max_results: maxResults,
    search_depth: input.searchDepth ?? 'basic',
    include_answer: input.includeAnswer ?? false,
  });

  let attempt = 0;
  let lastErr: unknown;

  while (attempt <= retries) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await doFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      });

      if (res.status === 401 || res.status === 403) {
        const text = await safeText(res);
        throw new WebSearchError(
          `Tavily rejected the API key (HTTP ${res.status}). Verify TAVILY_API_KEY at https://tavily.com. Body: ${truncate(text)}`,
          { status: res.status },
        );
      }

      if (TRANSIENT_STATUSES.has(res.status)) {
        const text = await safeText(res);
        lastErr = new WebSearchError(
          `Tavily transient HTTP ${res.status}: ${truncate(text)}`,
          { status: res.status },
        );
        attempt += 1;
        if (attempt > retries) throw lastErr;
        await sleep(backoffMs);
        continue;
      }

      if (!res.ok) {
        const text = await safeText(res);
        throw new WebSearchError(`Tavily HTTP ${res.status}: ${truncate(text)}`, {
          status: res.status,
        });
      }

      // Reject malformed bodies before they reach the agent.
      let json: unknown;
      try {
        json = await res.json();
      } catch (cause) {
        throw new WebSearchError('Tavily response was not valid JSON', { cause });
      }
      if (
        !json ||
        typeof json !== 'object' ||
        !Array.isArray((json as { results?: unknown }).results)
      ) {
        throw new WebSearchError('Tavily response missing `results` array');
      }
      return json as TavilySearchResponse;
    } catch (err) {
      // AbortError = our timeout fired. Retry once if budget remains.
      if (
        err instanceof Error &&
        (err.name === 'AbortError' || err.message.includes('aborted'))
      ) {
        lastErr = new WebSearchError(`Tavily timed out after ${timeoutMs}ms`, { cause: err });
        attempt += 1;
        if (attempt > retries) throw lastErr;
        await sleep(backoffMs);
        continue;
      }

      // Non-transient errors — propagate immediately.
      if (err instanceof WebSearchError) throw err;
      throw new WebSearchError(`Tavily request failed: ${(err as Error).message ?? err}`, {
        cause: err,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  // Unreachable in practice — the loop body either returns or throws.
  throw lastErr instanceof Error
    ? lastErr
    : new WebSearchError('Tavily request exhausted retries with no error captured');
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '<no body>';
  }
}

function truncate(s: string, n = 200): string {
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
