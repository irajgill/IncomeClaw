import { describe, it, expect, vi } from 'vitest';
import { webSearch, TAVILY_DEFAULT_ENDPOINT } from '../src/web-search.js';
import { WebSearchError } from '../src/errors.js';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function textResponse(status: number, text: string): Response {
  return new Response(text, { status, headers: { 'Content-Type': 'text/plain' } });
}

describe('webSearch', () => {
  describe('input validation', () => {
    it('throws WebSearchError on too-short query', async () => {
      await expect(
        webSearch({ query: 'hi' }, { apiKey: 'tvly-test', fetchImpl: vi.fn() }),
      ).rejects.toBeInstanceOf(WebSearchError);
    });

    it('throws WebSearchError on out-of-range maxResults', async () => {
      await expect(
        webSearch({ query: 'hello world', maxResults: 0 }, { apiKey: 'tvly', fetchImpl: vi.fn() }),
      ).rejects.toThrow(/maxResults/);
      await expect(
        webSearch({ query: 'hello world', maxResults: 11 }, { apiKey: 'tvly', fetchImpl: vi.fn() }),
      ).rejects.toThrow(/maxResults/);
    });

    it('does not call fetch when validation fails', async () => {
      const fetchImpl = vi.fn();
      await expect(webSearch({ query: '' }, { apiKey: 'k', fetchImpl })).rejects.toBeInstanceOf(
        WebSearchError,
      );
      expect(fetchImpl).not.toHaveBeenCalled();
    });
  });

  describe('happy path', () => {
    it('returns the parsed Tavily response on 200', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(
        jsonResponse(200, {
          query: 'ACME funding 2026',
          results: [
            { title: 'ACME closes $50M Series B', url: 'https://example.com/a', content: '...', score: 0.9 },
            { title: 'ACME Q4 hiring spree', url: 'https://example.com/b', content: '...', score: 0.7 },
          ],
        }),
      );

      const out = await webSearch(
        { query: 'ACME funding 2026', maxResults: 2 },
        { apiKey: 'tvly-test', fetchImpl },
      );

      expect(out.results).toHaveLength(2);
      expect(out.results[0]?.title).toMatch(/Series B/);
      expect(fetchImpl).toHaveBeenCalledTimes(1);

      // Verify the request was wired correctly.
      const [url, init] = fetchImpl.mock.calls[0]!;
      expect(url).toBe(TAVILY_DEFAULT_ENDPOINT);
      expect(init?.method).toBe('POST');
      const body = JSON.parse(init!.body as string);
      expect(body).toMatchObject({
        api_key: 'tvly-test',
        query: 'ACME funding 2026',
        max_results: 2,
        search_depth: 'basic',
        include_answer: false,
      });
    });

    it('respects a custom endpoint override', async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(jsonResponse(200, { query: 'x', results: [] }));
      await webSearch(
        { query: 'something' },
        { apiKey: 'k', endpoint: 'https://example.test/search', fetchImpl },
      );
      expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://example.test/search');
    });
  });

  describe('error mapping', () => {
    it('throws WebSearchError with status=401 on auth failure (no retry)', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(textResponse(401, 'invalid key'));
      const err = await webSearch(
        { query: 'hello world' },
        { apiKey: 'tvly-bad', fetchImpl },
      ).catch((e) => e);

      expect(err).toBeInstanceOf(WebSearchError);
      expect(err.status).toBe(401);
      expect(err.message).toMatch(/tavily\.com/i);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('throws WebSearchError with status=403 on auth failure (no retry)', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(textResponse(403, 'forbidden'));
      const err = await webSearch(
        { query: 'hello world' },
        { apiKey: 'tvly-bad', fetchImpl },
      ).catch((e) => e);
      expect(err.status).toBe(403);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('does not retry on a 4xx other than 401/403', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(textResponse(429, 'too many requests'));
      const err = await webSearch(
        { query: 'hello world' },
        { apiKey: 'k', fetchImpl, retryBackoffMs: 1 },
      ).catch((e) => e);
      expect(err).toBeInstanceOf(WebSearchError);
      expect(err.status).toBe(429);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('retries exactly once on 503, then succeeds', async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(textResponse(503, 'gateway down'))
        .mockResolvedValueOnce(jsonResponse(200, { query: 'q', results: [] }));

      const out = await webSearch(
        { query: 'hello world' },
        { apiKey: 'k', fetchImpl, retryBackoffMs: 1 },
      );

      expect(out.results).toEqual([]);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('retries once on 503, then fails with WebSearchError when retry also fails', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(textResponse(503, 'still down'));
      const err = await webSearch(
        { query: 'hello world' },
        { apiKey: 'k', fetchImpl, retryBackoffMs: 1 },
      ).catch((e) => e);

      expect(err).toBeInstanceOf(WebSearchError);
      expect(err.status).toBe(503);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('throws WebSearchError on malformed JSON', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(
        new Response('not json{', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      const err = await webSearch(
        { query: 'hello world' },
        { apiKey: 'k', fetchImpl },
      ).catch((e) => e);
      expect(err).toBeInstanceOf(WebSearchError);
      expect(err.message).toMatch(/JSON/);
    });

    it('throws WebSearchError when results array is missing', async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { query: 'q' }));
      const err = await webSearch(
        { query: 'hello world' },
        { apiKey: 'k', fetchImpl },
      ).catch((e) => e);
      expect(err).toBeInstanceOf(WebSearchError);
      expect(err.message).toMatch(/results/);
    });
  });

  describe('timeout', () => {
    it('aborts after timeoutMs and throws WebSearchError', async () => {
      // fetchImpl that respects AbortSignal — resolves only when aborted.
      const fetchImpl: typeof fetch = (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          );
        }) as Promise<Response>;

      const start = Date.now();
      const err = await webSearch(
        { query: 'hello world' },
        { apiKey: 'k', fetchImpl, timeoutMs: 50, retries: 0, retryBackoffMs: 1 },
      ).catch((e) => e);
      const elapsed = Date.now() - start;

      expect(err).toBeInstanceOf(WebSearchError);
      expect(err.message).toMatch(/timed out/);
      // Loose upper bound — proves we didn't sit forever.
      expect(elapsed).toBeLessThan(500);
    });
  });
});
