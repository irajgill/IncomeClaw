// apps/orchestrator/test/mesh-dispatch.integration.test.ts
//
// Phase C.4 — End-to-end mesh dispatch against real 0G Galileo testnet.
//
// What it proves:
//   1. createIncomeMesh().dispatch(brief) walks planExecuteCritique
//      (Brain → Strategist+Opener+Closer in parallel → Brain critic) and
//      then the sequential Operator leg.
//   2. The mesh writes events to the per-task OG_Log bus namespace,
//      surfaced as eventPointers.
//   3. After dispatch, calling pay-onchain directly produces a real
//      PaymentReceipt tx whose totalRevenue increment is observable.
//
// Cost: ~0.005 0G in storage fees + ~0.001 0G chain gas + a handful of
// Router-paid inference calls. Runs ~3-5 minutes serial. Gate strictly:
//
//   INTEGRATION=1 PRIVATE_KEY=0x... COMPUTE_ROUTER_API_KEY=sk-... \
//     pnpm --filter @incomeclaw/orchestrator test
//
// Skipped by default.

import { describe, expect, it } from 'vitest';
import { JsonRpcProvider, Wallet, Contract } from 'ethers';
import { createIncomeMesh, payOnChainTool } from '@incomeclaw/agents';
import { executeTool } from '@sovereignclaw/core';

const RUN = process.env.INTEGRATION === '1';
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const COMPUTE_ROUTER_API_KEY = process.env.COMPUTE_ROUTER_API_KEY;
const RPC_URL = process.env.RPC_URL ?? 'https://evmrpc-testnet.0g.ai';
const INDEXER_URL = process.env.INDEXER_URL ?? 'https://indexer-storage-testnet-turbo.0g.ai';
const PAYMENT_RECEIPT_ADDRESS =
  process.env.PAYMENT_RECEIPT_ADDRESS ?? '0x0005910E1ecf654e7661C7beeA31A3ddE3BD3d8F';
const COMPUTE_MODEL = process.env.COMPUTE_MODEL ?? 'qwen/qwen-2.5-7b-instruct';

describe.skipIf(!RUN || !PRIVATE_KEY || !COMPUTE_ROUTER_API_KEY)(
  'Phase C.4 — IncomeMesh end-to-end on Galileo testnet',
  () => {
    it(
      'dispatches a brief, executes PEC, sequential Operator, then pay-onchain',
      async () => {
        const provider = new JsonRpcProvider(RPC_URL);
        const signer = new Wallet(PRIVATE_KEY!, provider);
        const env = {
          signer,
          rpcUrl: RPC_URL,
          indexerUrl: INDEXER_URL,
          routerApiKey: COMPUTE_ROUTER_API_KEY!,
          model: COMPUTE_MODEL,
          persist: true,
        };

        // Read totalRevenue before the run to assert pay-onchain bumped it.
        const pr = new Contract(
          PAYMENT_RECEIPT_ADDRESS,
          ['function totalRevenue() view returns (uint256)'],
          provider,
        );
        const totalBefore = (await pr.totalRevenue!()) as bigint;

        const incomeMesh = await createIncomeMesh({
          env,
          paymentReceiptAddress: PAYMENT_RECEIPT_ADDRESS,
          meshId: `c4-${Date.now()}`,
          maxRounds: 1,
          acceptThreshold: 0.0, // accept first round to keep cost bounded
        });

        try {
          const brief =
            'Pick a target from the seeded leads and dispatch the team. Final output: a one-line summary of the close.';
          const result = await incomeMesh.dispatch(brief);

          expect(result.taskId).toMatch(/^c4-/);
          expect(result.acceptedOutput.length).toBeGreaterThan(0);
          expect(result.operatorOutput.length).toBeGreaterThan(0);
          expect(result.busEventPointers.length).toBeGreaterThan(0);
          expect(result.pec.acceptedExecutor).toMatch(/strategist|opener|closer/);
          // Each event pointer is a 0G root hash (32-byte hex).
          for (const ptr of result.busEventPointers) {
            expect(ptr).toMatch(/^0x[a-f0-9]{64}$/i);
          }

          // Now exercise pay-onchain directly (model-driven function calling
          // not yet in @sovereignclaw/core@0.2.0 — see Phase B carryover).
          const payTool = payOnChainTool({
            signer,
            contractAddress: PAYMENT_RECEIPT_ADDRESS,
          });
          const payResult = await executeTool(payTool, {
            agentTokenId: 0n,
            payer: '0x000000000000000000000000000000000000dEaD',
            amountUsd: 50,
            dealRef: result.taskId,
          });
          expect(payResult.txHash).toMatch(/^0x[a-f0-9]{64}$/i);
          expect(payResult.receiptId).toBeGreaterThan(0n);
          expect(payResult.amountWei).toBeGreaterThan(0n);
          expect(payResult.explorerUrl).toContain(payResult.txHash);

          const totalAfter = (await pr.totalRevenue!()) as bigint;
          expect(totalAfter - totalBefore).toBe(payResult.amountWei);
        } finally {
          await incomeMesh.close();
        }
      },
      // 6 minutes — five agent runs + storage fees + chain confirmation
      6 * 60_000,
    );
  },
);
