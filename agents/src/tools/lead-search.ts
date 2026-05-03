// agents/src/tools/lead-search.ts
//
// Brain's only tool — reads data/mock-leads.json and ranks leads by
// (estimatedBudgetUsd / buyingCycleDays). Brain calls this exactly once at
// the start of a dispatch to pick a target. No web calls, no state.
//
// Phase B per IncomeClaw-Roadmap.md §7. The richer Tavily-backed wrapper
// (agents/src/web-search.ts) is consumed by Strategist in a later phase;
// this tool stays narrow on purpose so Brain's planning stays deterministic.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineTool } from '@sovereignclaw/core';
import { z } from 'zod';
import { LeadDataMissingError, ToolDataError } from '../errors.js';

export const leadSearchSchema = z
  .object({
    /** Optional: filter to leads in a specific industry. Case-insensitive substring match. */
    industry: z.string().optional(),
    /** Optional: minimum estimated budget in USD. */
    minBudgetUsd: z.number().int().nonnegative().optional(),
    /** Optional: maximum acceptable buying cycle in days. */
    maxBuyingCycleDays: z.number().int().positive().optional(),
    /** How many leads to return. Default 3. */
    limit: z.number().int().min(1).max(10).optional(),
  })
  .strict();

export type LeadSearchInput = z.infer<typeof leadSearchSchema>;

export interface DecisionMaker {
  name: string;
  title: string;
  linkedinPath?: string;
  email?: string;
}

export interface Lead {
  id: string;
  company: string;
  industry: string;
  headcount: number;
  headquarters: string;
  decisionMaker: DecisionMaker;
  annualRevenueUsd?: number;
  aumUsd?: number;
  estimatedBudgetUsd: number;
  painPoints: string[];
  trigger: string;
  buyingCycleDays: number;
  preferredAngle: string;
}

export interface RankedLead extends Lead {
  /** Higher = more attractive. Currently estimatedBudgetUsd / buyingCycleDays. */
  rankScore: number;
}

export interface LeadSearchOptions {
  /** Absolute path to mock-leads.json. Defaults to <repoRoot>/data/mock-leads.json. */
  leadsPath?: string;
  /** Inject a reader for tests. */
  readImpl?: (path: string) => Promise<string>;
}

const DEFAULT_LEADS_PATH = (() => {
  // agents/src/tools/lead-search.ts → ../../../data/mock-leads.json from compiled dist too.
  // We resolve at call time via process.cwd() to keep this portable across pnpm
  // workspace layouts and Docker bind mounts.
  return join(process.cwd(), 'data', 'mock-leads.json');
})();

/**
 * Build the lead-search tool. Tied to a specific leads file path so callers
 * can run tests against a fixture without touching the production JSON.
 */
export function leadSearchTool(options: LeadSearchOptions = {}) {
  const leadsPath = options.leadsPath ?? DEFAULT_LEADS_PATH;
  const readImpl = options.readImpl ?? ((p: string) => readFile(p, 'utf8'));

  return defineTool({
    name: 'lead-search',
    description:
      'Returns up to N leads ranked by attractiveness (budget / cycle days). Pure read of the seeded mock leads file. Used by Brain to pick a target.',
    schema: leadSearchSchema,
    timeoutMs: 5_000,
    async run(input) {
      const limit = input.limit ?? 3;
      let raw: string;
      try {
        raw = await readImpl(leadsPath);
      } catch (cause) {
        throw new LeadDataMissingError(leadsPath, { cause });
      }
      let parsed: { leads?: unknown };
      try {
        parsed = JSON.parse(raw);
      } catch (cause) {
        throw new ToolDataError('lead-search: mock-leads.json is not valid JSON', { cause });
      }
      if (!parsed.leads || !Array.isArray(parsed.leads)) {
        throw new ToolDataError('lead-search: mock-leads.json missing `leads` array');
      }
      const leads = parsed.leads as Lead[];

      const filtered = leads.filter((l) => {
        if (input.industry && !l.industry.toLowerCase().includes(input.industry.toLowerCase())) {
          return false;
        }
        if (input.minBudgetUsd !== undefined && l.estimatedBudgetUsd < input.minBudgetUsd) {
          return false;
        }
        if (
          input.maxBuyingCycleDays !== undefined &&
          l.buyingCycleDays > input.maxBuyingCycleDays
        ) {
          return false;
        }
        return true;
      });

      const ranked: RankedLead[] = filtered
        .map((l) => ({ ...l, rankScore: l.estimatedBudgetUsd / l.buyingCycleDays }))
        .sort((a, b) => b.rankScore - a.rankScore)
        .slice(0, limit);

      return { count: ranked.length, leads: ranked };
    },
  });
}
