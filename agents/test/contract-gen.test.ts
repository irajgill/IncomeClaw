import { describe, expect, it } from 'vitest';
import { contractGenTool } from '../src/tools/contract-gen.js';
import { ToolValidationError, executeTool } from '@sovereignclaw/core';

const TERMS = {
  dealRef: 'ACME-2026-01',
  scope: 'AI-assisted order-intake automation across the existing desk',
  deliverables: ['Intake bot integration', 'SLA dashboard'],
  priceUsd: 68000,
  termDays: 365,
  paymentSchedule: [
    { milestone: 'Signature', trigger: 'Contract execution', pctOfTotal: 40 },
    { milestone: 'Month 4 SLA', trigger: 'Breach < 6%', pctOfTotal: 30 },
    { milestone: 'Month 9', trigger: 'Renewal scoped', pctOfTotal: 30 },
  ],
  exitClauses: ['30-day notice on convenience'],
  objectionsHandled: [],
  winCondition: 'All milestones paid in full',
};

describe('contract-gen', () => {
  it('renders MSA with all five sections', async () => {
    const tool = contractGenTool();
    const out = await tool.run({
      terms: TERMS,
      buyerCompany: 'Acme Robotics, Inc.',
    });
    expect(out.dealRef).toBe('ACME-2026-01');
    expect(out.contractMarkdown).toContain('# Master Services Agreement — ACME-2026-01');
    expect(out.contractMarkdown).toContain('## 1. Scope');
    expect(out.contractMarkdown).toContain('## 2. Deliverables');
    expect(out.contractMarkdown).toContain('## 3. Fees and payment schedule');
    expect(out.contractMarkdown).toContain('## 4. Exit clauses');
    expect(out.contractMarkdown).toContain('## 5. Standard provisions');
    expect(out.contractMarkdown).toContain('Acme Robotics, Inc.');
    expect(out.contractMarkdown).toContain('68,000 USD');
    expect(out.contractMarkdown).toContain('IncomeClaw Operator');
  });

  it('renders an invoice for the first milestone', async () => {
    const tool = contractGenTool();
    const out = await tool.run({ terms: TERMS, buyerCompany: 'Acme Robotics, Inc.' });
    expect(out.invoiceMarkdown).toContain('# Invoice ACME-2026-01-INV-001');
    expect(out.firstMilestoneUsd).toBe(27200); // 40% of 68,000
    expect(out.invoiceMarkdown).toContain('27,200 USD');
    expect(out.invoiceMarkdown).toContain('Contract execution');
  });

  it('emits typed receipt args usable by pay-onchain', async () => {
    const tool = contractGenTool();
    const out = await tool.run({ terms: TERMS, buyerCompany: 'Acme Robotics, Inc.' });
    expect(out.receipt).toEqual({
      dealRef: 'ACME-2026-01',
      amountUsd: 27200,
      payerLabel: 'Acme Robotics, Inc.',
    });
  });

  it('rejects terms whose paymentSchedule pcts do not sum to 100', async () => {
    const tool = contractGenTool();
    const bad = { ...TERMS, paymentSchedule: [{ milestone: 'm', trigger: 't', pctOfTotal: 50 }] };
    await expect(
      executeTool(tool, { terms: bad as unknown as typeof TERMS, buyerCompany: 'X' }),
    ).rejects.toBeInstanceOf(ToolValidationError);
  });

  it('honors providerName override', async () => {
    const tool = contractGenTool();
    const out = await tool.run({
      terms: TERMS,
      buyerCompany: 'X',
      providerName: 'CustomCo',
    });
    expect(out.contractMarkdown).toContain('CustomCo');
  });
});
