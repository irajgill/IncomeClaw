// agents/src/tools/contract-gen.ts
//
// Operator's contract generator. Phase B ships templated string output only;
// PDF rendering is Phase F.
//
// Input: the signed-off terms JSON from the Closer.
// Output: { contractMarkdown, invoiceMarkdown, receiptArgs } — the three
// artifacts the Operator's prompt produces, but formed deterministically
// from typed input rather than relying on the model to format perfectly.
//
// We keep this separate from the model output because the legal text and
// the on-chain receipt args must be exact — no creative paraphrasing.

import { defineTool } from '@sovereignclaw/core';
import { z } from 'zod';
import { TermsValidationError } from '../errors.js';

export const closerTermsSchema = z
  .object({
    dealRef: z.string().min(1),
    scope: z.string().min(10),
    deliverables: z.array(z.string().min(3)).min(1),
    priceUsd: z.number().int().positive(),
    termDays: z.number().int().positive(),
    paymentSchedule: z
      .array(
        z.object({
          milestone: z.string().min(1),
          trigger: z.string().min(1),
          pctOfTotal: z.number().min(0).max(100),
        }),
      )
      .min(1),
    exitClauses: z.array(z.string()).default([]),
    objectionsHandled: z
      .array(z.object({ objection: z.string(), response: z.string() }))
      .default([]),
    winCondition: z.string().min(1),
  })
  .strict()
  .superRefine((terms, ctx) => {
    const totalPct = terms.paymentSchedule.reduce((a, m) => a + m.pctOfTotal, 0);
    if (Math.abs(totalPct - 100) > 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `paymentSchedule pctOfTotal must sum to 100; got ${totalPct}`,
        path: ['paymentSchedule'],
      });
    }
  });

export type CloserTerms = z.infer<typeof closerTermsSchema>;

export const contractGenSchema = z
  .object({
    terms: closerTermsSchema,
    /** Buyer company name. Used in the MSA header. */
    buyerCompany: z.string().min(1),
    /** Provider name. Defaults to "IncomeClaw Operator". */
    providerName: z.string().min(1).optional(),
  })
  .strict();

export type ContractGenInput = z.infer<typeof contractGenSchema>;

export interface ContractGenResult {
  dealRef: string;
  contractMarkdown: string;
  invoiceMarkdown: string;
  /** First milestone amount in USD, used by pay-onchain. */
  firstMilestoneUsd: number;
  /** Receipt args ready for `pay-onchain`. amount in 0G wei is computed by pay-onchain. */
  receipt: {
    dealRef: string;
    amountUsd: number;
    payerLabel: string;
  };
}

/**
 * Build the contract-gen tool. Pure function of typed input.
 */
export function contractGenTool() {
  return defineTool({
    name: 'contract-gen',
    description:
      "Renders a templated MSA + invoice from the Closer's signed terms. Returns markdown for the MSA, an invoice for the first milestone, and the args the Operator will hand to pay-onchain.",
    schema: contractGenSchema,
    timeoutMs: 1_000,
    async run(input): Promise<ContractGenResult> {
      const { terms, buyerCompany } = input;
      const providerName = input.providerName ?? 'IncomeClaw Operator';
      const firstMilestone = terms.paymentSchedule[0];
      if (!firstMilestone) {
        throw new TermsValidationError('contract-gen: paymentSchedule is empty');
      }
      const firstMilestoneUsd = Math.round((terms.priceUsd * firstMilestone.pctOfTotal) / 100);
      const today = new Date().toISOString().slice(0, 10);
      const dueDate = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);

      const contractMarkdown = [
        `# Master Services Agreement — ${terms.dealRef}`,
        ``,
        `**Parties:** ${providerName} ("Provider") and ${buyerCompany} ("Client").`,
        `**Effective date:** ${today}.`,
        `**Term:** ${terms.termDays} days from effective date.`,
        ``,
        `## 1. Scope`,
        terms.scope,
        ``,
        `## 2. Deliverables`,
        ...terms.deliverables.map((d) => `- ${d}`),
        ``,
        `## 3. Fees and payment schedule`,
        `Total: ${terms.priceUsd.toLocaleString('en-US')} USD.`,
        ``,
        `| Milestone | Trigger | Amount (USD) |`,
        `| --- | --- | --- |`,
        ...terms.paymentSchedule.map((m) => {
          const amt = Math.round((terms.priceUsd * m.pctOfTotal) / 100);
          return `| ${m.milestone} | ${m.trigger} | ${amt.toLocaleString('en-US')} |`;
        }),
        ``,
        `## 4. Exit clauses`,
        ...((terms.exitClauses ?? []).length > 0
          ? (terms.exitClauses ?? []).map((c) => `- ${c}`)
          : ['- None.']),
        ``,
        `## 5. Standard provisions`,
        `This is a hackathon-scope MSA. Production deployments must replace this`,
        `clause with a real legal review of confidentiality, IP, indemnity, and`,
        `governing law. Provider and Client acknowledge that this template is`,
        `demonstration-grade.`,
        ``,
        `Signed by Provider: ______________________`,
        `Signed by Client:  ______________________`,
        ``,
      ].join('\n');

      const invoiceMarkdown = [
        `# Invoice ${terms.dealRef}-INV-001`,
        ``,
        `**Bill to:** ${buyerCompany}`,
        `**Issue date:** ${today}`,
        `**Due date:** ${dueDate}`,
        `**Amount:** ${firstMilestoneUsd.toLocaleString('en-US')} USD`,
        `**Payment trigger:** ${firstMilestone.trigger}`,
        ``,
        `Wire instructions are out of scope for this demo; this invoice settles`,
        `via the on-chain \`PaymentReceipt\` contract on 0G Galileo testnet`,
        `(recorded by the Operator agent's pay-onchain tool).`,
        ``,
      ].join('\n');

      return {
        dealRef: terms.dealRef,
        contractMarkdown,
        invoiceMarkdown,
        firstMilestoneUsd,
        receipt: {
          dealRef: terms.dealRef,
          amountUsd: firstMilestoneUsd,
          payerLabel: buyerCompany,
        },
      };
    },
  });
}
