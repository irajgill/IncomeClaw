// agents/src/operator.ts — contract + invoice + on-chain payment agent.
//
// Tools: contract-gen (templated MSA + invoice from terms), pay-onchain
// (real PaymentReceipt tx on 0G Galileo).
//
// Reflection OFF: the deliverables are deterministic (templated contract,
// templated invoice, exact-args on-chain call). Reflecting on a templated
// document doesn't improve quality.

import { Agent, type Tool } from '@sovereignclaw/core';
import { Wallet, type Signer } from 'ethers';
import { buildInferenceAdapter, buildMemory, loadSystemPrompt, type AgentEnv } from './shared.js';
import { contractGenTool } from './tools/contract-gen.js';
import { payOnChainTool } from './tools/pay-onchain.js';

export interface OperatorOptions {
  env: AgentEnv;
  /** Deployed PaymentReceipt address. */
  paymentReceiptAddress: string;
  /** Optional dedicated signer for on-chain submissions. Defaults to env.signer. */
  payOnChainSigner?: Signer;
  /** Override USD→wei conversion. Default 1 USD = 0.001 0G. */
  amountWeiPerUsd?: bigint;
}

export async function createOperatorAgent(options: OperatorOptions): Promise<Agent> {
  const { env, paymentReceiptAddress } = options;
  const memory = await buildMemory(env, 'operator');
  const systemPrompt = await loadSystemPrompt('operator');
  const signer = options.payOnChainSigner ?? env.signer;
  if (!(signer instanceof Wallet) && !('sendTransaction' in signer)) {
    throw new Error('Operator: signer must support sendTransaction (ethers Signer)');
  }

  const tools: Tool[] = [
    contractGenTool(),
    payOnChainTool({
      signer,
      contractAddress: paymentReceiptAddress,
      amountWeiPerUsd: options.amountWeiPerUsd,
    }),
  ];

  return new Agent({
    role: 'operator',
    inference: buildInferenceAdapter(env),
    memory: memory.state,
    history: memory.history,
    systemPrompt,
    tools,
    temperature: 0.1,
    maxTokens: 1_200,
  });
}
