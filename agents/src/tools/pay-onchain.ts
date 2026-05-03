// agents/src/tools/pay-onchain.ts
//
// Operator's on-chain payment tool. Submits a real PaymentReceipt.recordPayment
// tx on 0G Galileo testnet. Returns { txHash, receiptId, amountWei, explorerUrl }.
//
// Note on `amount`: PaymentReceipt.recordPayment doesn't transfer value — it
// just records an amount in the event payload (the dashboard's revenue counter
// reads totalRevenue from the contract). We convert USD → 0G wei via a fixed
// demo rate so the on-chain value reads at human scale on the explorer
// (default: 1 USD = 0.001 0G = 1e15 wei). Override via `amountWeiPerUsd`.
//
// The wallet only pays gas. Faucet caps allow many runs per day per wallet.

import { defineTool, type Tool } from '@sovereignclaw/core';
import { Contract, type Signer, type TransactionReceipt } from 'ethers';
import { z } from 'zod';
import { OnChainPaymentError } from '../errors.js';

export const PAYMENT_RECEIPT_ABI = [
  'function recordPayment(uint256 agentTokenId, address payer, uint256 amount, string calldata dealRef) external returns (uint256 receiptId)',
  'function totalRevenue() external view returns (uint256)',
  'event PaymentReceived(uint256 indexed receiptId, uint256 indexed agentTokenId, address indexed payer, uint256 amount, string dealRef, uint64 timestamp)',
] as const;

/** Default conversion: 1 USD = 0.001 0G = 1e15 wei. */
export const DEFAULT_AMOUNT_WEI_PER_USD = 1_000_000_000_000_000n;

export const payOnChainSchema = z
  .object({
    /** Operator's iNFT tokenId (uint256). For Phase B run-agent isolated runs we accept 0. */
    agentTokenId: z.bigint().nonnegative(),
    /** Hex address (0x-prefixed) of the deal payer. Use a constant demo address for mocks. */
    payer: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    /** Deal price in USD. Converted to 0G wei via amountWeiPerUsd. */
    amountUsd: z.number().int().positive(),
    /** Deal reference string. Must be non-empty (contract reverts on empty). */
    dealRef: z.string().min(1),
  })
  .strict();

export type PayOnChainInput = z.infer<typeof payOnChainSchema>;

export interface PayOnChainResult {
  txHash: string;
  receiptId: bigint;
  amountWei: bigint;
  blockNumber: number;
  explorerUrl: string;
  gasUsed: bigint;
}

export interface PayOnChainOptions {
  signer: Signer;
  /** Deployed PaymentReceipt address. Default reads from deployments/0g-testnet.json at construction time. */
  contractAddress: string;
  /** Chain explorer base URL. Defaults to 0G chainscan-galileo. */
  explorerBaseUrl?: string;
  /** Override the USD→wei conversion. */
  amountWeiPerUsd?: bigint;
  /** Override the timeout. Default 60s — chain confirmations on Galileo are typically <15s. */
  timeoutMs?: number;
}

/**
 * Build the pay-onchain tool. Submits a real PaymentReceipt tx and returns
 * the on-chain receipt id parsed from the emitted event.
 */
export function payOnChainTool(options: PayOnChainOptions): Tool<PayOnChainInput, PayOnChainResult> {
  const explorerBase = options.explorerBaseUrl ?? 'https://chainscan-galileo.0g.ai';
  const rate = options.amountWeiPerUsd ?? DEFAULT_AMOUNT_WEI_PER_USD;
  const contract = new Contract(options.contractAddress, PAYMENT_RECEIPT_ABI, options.signer);

  return defineTool({
    name: 'pay-onchain',
    description:
      'Submits a real PaymentReceipt.recordPayment tx on 0G Galileo. Returns tx hash, on-chain receipt id, amount in wei, block number, and explorer URL.',
    schema: payOnChainSchema,
    timeoutMs: options.timeoutMs ?? 60_000,
    async run(input): Promise<PayOnChainResult> {
      const amountWei = BigInt(input.amountUsd) * rate;

      let tx;
      let receipt: TransactionReceipt | null;
      try {
        tx = await contract.recordPayment!(input.agentTokenId, input.payer, amountWei, input.dealRef);
        receipt = await tx.wait();
      } catch (cause) {
        throw new OnChainPaymentError(
          `pay-onchain: recordPayment tx failed for ${input.dealRef}`,
          { cause },
        );
      }
      if (!receipt) {
        throw new OnChainPaymentError('pay-onchain: tx receipt was null after wait()');
      }

      // Parse the PaymentReceived event for the assigned receiptId.
      const iface = contract.interface;
      const eventTopic = iface.getEvent('PaymentReceived')!.topicHash;
      const log = receipt.logs.find((l) => l.topics[0] === eventTopic);
      if (!log) {
        throw new OnChainPaymentError(
          `pay-onchain: PaymentReceived event not found in tx ${tx.hash}`,
        );
      }
      const parsed = iface.parseLog(log);
      if (!parsed) {
        throw new OnChainPaymentError(
          `pay-onchain: failed to parse PaymentReceived log in tx ${tx.hash}`,
        );
      }
      const receiptId = parsed.args[0] as bigint;

      return {
        txHash: tx.hash,
        receiptId,
        amountWei,
        blockNumber: receipt.blockNumber,
        explorerUrl: `${explorerBase}/tx/${tx.hash}`,
        gasUsed: receipt.gasUsed,
      };
    },
  });
}
