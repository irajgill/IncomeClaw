// Typed error classes per IncomeClaw-Roadmap.md §13 working agreement #9.
// More classes land in Phases C/D/E as agents and routes are written.

export class IncomeClawError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/**
 * Thrown by the Tavily web-search tool when the upstream search API rejects
 * a request, returns malformed data, or times out after the configured retry
 * budget. See agents/tools/web-search.ts (Phase C) and scripts/smoke-tavily.ts.
 */
export class WebSearchError extends IncomeClawError {
  readonly status?: number;
  constructor(message: string, options?: { cause?: unknown; status?: number }) {
    super(message, { cause: options?.cause });
    this.status = options?.status;
  }
}
