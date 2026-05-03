import { describe, expect, it } from 'vitest';
import { leadSearchTool } from '../src/tools/lead-search.js';
import { LeadDataMissingError, ToolDataError } from '../src/errors.js';

const FIXTURE_LEADS = JSON.stringify({
  schemaVersion: 1,
  leads: [
    {
      id: 'A',
      company: 'Acme',
      industry: 'Robotics',
      headcount: 100,
      headquarters: 'NY',
      decisionMaker: { name: 'A', title: 't' },
      estimatedBudgetUsd: 50000,
      painPoints: ['p'],
      trigger: 't',
      buyingCycleDays: 30,
      preferredAngle: 'a',
    },
    {
      id: 'B',
      company: 'Beta',
      industry: 'Healthcare',
      headcount: 200,
      headquarters: 'CA',
      decisionMaker: { name: 'B', title: 't' },
      estimatedBudgetUsd: 100000,
      painPoints: ['p'],
      trigger: 't',
      buyingCycleDays: 60,
      preferredAngle: 'a',
    },
    {
      id: 'C',
      company: 'Gamma',
      industry: 'Logistics',
      headcount: 50,
      headquarters: 'TX',
      decisionMaker: { name: 'C', title: 't' },
      estimatedBudgetUsd: 200000,
      painPoints: ['p'],
      trigger: 't',
      buyingCycleDays: 30,
      preferredAngle: 'a',
    },
  ],
});

describe('lead-search', () => {
  it('ranks by estimatedBudgetUsd / buyingCycleDays', async () => {
    const tool = leadSearchTool({ readImpl: async () => FIXTURE_LEADS });
    const out = await tool.run({});
    expect(out.leads.map((l) => l.id)).toEqual(['C', 'A', 'B']);
    // C: 200000/30 = 6666.7  A: 50000/30 = 1666.7  B: 100000/60 = 1666.7
    expect(out.leads[0]!.rankScore).toBeGreaterThan(out.leads[1]!.rankScore);
  });

  it('honors limit', async () => {
    const tool = leadSearchTool({ readImpl: async () => FIXTURE_LEADS });
    const out = await tool.run({ limit: 1 });
    expect(out.count).toBe(1);
    expect(out.leads).toHaveLength(1);
  });

  it('filters by industry (case-insensitive substring)', async () => {
    const tool = leadSearchTool({ readImpl: async () => FIXTURE_LEADS });
    const out = await tool.run({ industry: 'health' });
    expect(out.leads.map((l) => l.id)).toEqual(['B']);
  });

  it('filters by minBudgetUsd', async () => {
    const tool = leadSearchTool({ readImpl: async () => FIXTURE_LEADS });
    const out = await tool.run({ minBudgetUsd: 60000 });
    expect(out.leads.map((l) => l.id).sort()).toEqual(['B', 'C']);
  });

  it('filters by maxBuyingCycleDays', async () => {
    const tool = leadSearchTool({ readImpl: async () => FIXTURE_LEADS });
    const out = await tool.run({ maxBuyingCycleDays: 30 });
    expect(out.leads.map((l) => l.id).sort()).toEqual(['A', 'C']);
  });

  it('throws LeadDataMissingError when read fails', async () => {
    const tool = leadSearchTool({
      readImpl: async () => {
        throw new Error('ENOENT');
      },
    });
    await expect(tool.run({})).rejects.toBeInstanceOf(LeadDataMissingError);
  });

  it('throws ToolDataError on malformed JSON', async () => {
    const tool = leadSearchTool({ readImpl: async () => 'not-json' });
    await expect(tool.run({})).rejects.toBeInstanceOf(ToolDataError);
  });

  it('throws ToolDataError when leads array missing', async () => {
    const tool = leadSearchTool({ readImpl: async () => '{"leads":"oops"}' });
    await expect(tool.run({})).rejects.toBeInstanceOf(ToolDataError);
  });
});
