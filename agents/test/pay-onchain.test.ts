// pay-onchain unit test — validates input schema and the wei-conversion math.
// The actual chain submission is exercised in Phase B.7 (DoD) against the
// live PaymentReceipt deployment on 0G Galileo. Mocking ethers internals
// from a unit test buys little signal here.

import { describe, expect, it } from 'vitest';
import {
  payOnChainTool,
  payOnChainSchema,
  DEFAULT_AMOUNT_WEI_PER_USD,
} from '../src/tools/pay-onchain.js';
import type { Signer } from 'ethers';
import { ToolValidationError, executeTool } from '@sovereignclaw/core';

const FAKE_SIGNER = {} as unknown as Signer;
const FAKE_ADDR = '0x0000000000000000000000000000000000000001';

describe('pay-onchain', () => {
  it('rejects bad payer addresses', () => {
    const r = payOnChainSchema.safeParse({
      agentTokenId: 1n,
      payer: '0xnotanaddress',
      amountUsd: 100,
      dealRef: 'X',
    });
    expect(r.success).toBe(false);
  });

  it('rejects non-positive amounts', () => {
    const r = payOnChainSchema.safeParse({
      agentTokenId: 1n,
      payer: FAKE_ADDR,
      amountUsd: 0,
      dealRef: 'X',
    });
    expect(r.success).toBe(false);
  });

  it('rejects empty dealRef', () => {
    const r = payOnChainSchema.safeParse({
      agentTokenId: 1n,
      payer: FAKE_ADDR,
      amountUsd: 100,
      dealRef: '',
    });
    expect(r.success).toBe(false);
  });

  it('accepts well-formed input', () => {
    const r = payOnChainSchema.safeParse({
      agentTokenId: 1n,
      payer: FAKE_ADDR,
      amountUsd: 50000,
      dealRef: 'ACME-2026-01',
    });
    expect(r.success).toBe(true);
  });

  it('default rate is 1 USD = 0.001 0G (1e15 wei)', () => {
    expect(DEFAULT_AMOUNT_WEI_PER_USD).toBe(1_000_000_000_000_000n);
    // sanity: $42K → 42 0G
    expect(42000n * DEFAULT_AMOUNT_WEI_PER_USD).toBe(42n * 10n ** 18n);
  });

  it('executeTool surfaces ToolValidationError on bad input', async () => {
    const tool = payOnChainTool({
      signer: FAKE_SIGNER,
      contractAddress: FAKE_ADDR,
    });
    await expect(
      executeTool(tool, { agentTokenId: 1n, payer: 'oops', amountUsd: 100, dealRef: 'X' }),
    ).rejects.toBeInstanceOf(ToolValidationError);
  });
});
