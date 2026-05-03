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

/**
 * Thrown by tools when their backing data file cannot be read or parsed.
 * Wraps the original cause so callers can introspect ENOENT vs JSON parse
 * vs permission errors.
 */
export class ToolDataError extends IncomeClawError {}

/** Specialization of ToolDataError for the Brain's lead-search tool. */
export class LeadDataMissingError extends ToolDataError {
  readonly leadsPath: string;
  constructor(leadsPath: string, options?: { cause?: unknown }) {
    super(`lead-search: cannot read leads file at ${leadsPath}`, { cause: options?.cause });
    this.leadsPath = leadsPath;
  }
}

/**
 * Thrown by the Opener's pitch-deck-gen tool when the model output doesn't
 * match the expected 5-slide + 4-sentence-email schema. The Opener loop
 * should re-prompt on this error rather than propagate it as a hard failure.
 */
export class PitchSchemaError extends IncomeClawError {}

/**
 * Thrown by contract-gen when the Closer's terms JSON fails Zod validation
 * (most commonly: paymentSchedule pcts don't sum to 100).
 */
export class TermsValidationError extends IncomeClawError {}

/**
 * Thrown by pay-onchain when the PaymentReceipt tx reverts, the receipt is
 * unparseable, or the wait timeout fires. The original ethers error is in
 * `cause` for inspection.
 */
export class OnChainPaymentError extends IncomeClawError {}
