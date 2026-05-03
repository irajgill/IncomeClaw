// scripts/run-agent.ts
//
// CLI: pnpm run-agent <role> "<prompt>" [--no-storage]
//
// Runs any of the five Phase B agents in isolation against the live testnet
// (or fully in-memory with --no-storage). Used to satisfy the Phase B DoD:
// "all 5 agents run in isolation against testnet; each writes encrypted state
// visible on 0G storage explorer; pay-onchain produces real tx visible on
// chain explorer." (IncomeClaw-Roadmap.md §7 Phase B)
//
// Examples:
//   pnpm run-agent brain      "Pick the best lead for a software vendor"
//   pnpm run-agent strategist "Lead: Acme Robotics, VP Ops Maya Okafor, $75K budget"
//   pnpm run-agent opener     "Brief: Acme Robotics order-intake automation, ROI angle"
//   pnpm run-agent closer     "Transcript: Buyer says budget capped at $48K..."
//   pnpm run-agent operator   '{"dealRef":"DEMO","scope":"…","priceUsd":42000,...}'

import 'dotenv/config';
import { JsonRpcProvider, Wallet } from 'ethers';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  createBrainAgent,
  createCloserAgent,
  createOpenerAgent,
  createOperatorAgent,
  createStrategistAgent,
  type AgentEnv,
} from '../agents/src/index.js';
import type { Agent } from '@sovereignclaw/core';

interface CliArgs {
  role: 'brain' | 'strategist' | 'opener' | 'closer' | 'operator';
  prompt: string;
  noStorage: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  const noStorage = args.includes('--no-storage');
  const positional = args.filter((a) => !a.startsWith('--'));
  if (positional.length < 2) {
    throw new Error(
      'usage: pnpm run-agent <brain|strategist|opener|closer|operator> "<prompt>" [--no-storage]',
    );
  }
  const role = positional[0] as CliArgs['role'];
  const prompt = positional.slice(1).join(' ');
  if (!['brain', 'strategist', 'opener', 'closer', 'operator'].includes(role)) {
    throw new Error(`unknown role: ${role}`);
  }
  return { role, prompt, noStorage };
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env: ${name}`);
  return v;
}

async function buildEnv(noStorage: boolean): Promise<AgentEnv> {
  const rpcUrl = process.env['RPC_URL'] ?? 'https://evmrpc-testnet.0g.ai';
  const indexerUrl =
    process.env['INDEXER_URL'] ?? 'https://indexer-storage-testnet-turbo.0g.ai';
  const provider = new JsonRpcProvider(rpcUrl);
  const signer = new Wallet(requireEnv('PRIVATE_KEY'), provider);
  return {
    signer,
    rpcUrl,
    indexerUrl,
    routerApiKey: requireEnv('COMPUTE_ROUTER_API_KEY'),
    model: process.env['COMPUTE_MODEL'],
    routerBaseUrl: process.env['COMPUTE_ROUTER_BASE_URL'],
    persist: !noStorage,
  };
}

async function loadDeployments(): Promise<{ paymentReceipt: string }> {
  const path = join(process.cwd(), 'deployments', '0g-testnet.json');
  const raw = JSON.parse(await readFile(path, 'utf8'));
  const addr = raw?.contracts?.paymentReceipt?.address;
  if (!addr) throw new Error(`PaymentReceipt address missing from ${path}`);
  return { paymentReceipt: addr };
}

async function buildAgent(role: CliArgs['role'], env: AgentEnv): Promise<Agent> {
  switch (role) {
    case 'brain':
      return createBrainAgent({ env });
    case 'strategist':
      return createStrategistAgent({ env });
    case 'opener':
      return createOpenerAgent({ env });
    case 'closer':
      return createCloserAgent({ env });
    case 'operator': {
      const { paymentReceipt } = await loadDeployments();
      return createOperatorAgent({ env, paymentReceiptAddress: paymentReceipt });
    }
  }
}

async function main(): Promise<void> {
  const { role, prompt, noStorage } = parseArgs(process.argv);
  const env = await buildEnv(noStorage);
  const agent = await buildAgent(role, env);

  console.log(`▸ ${role}  (storage=${noStorage ? 'in-memory' : 'OG_Log'})`);

  agent.on('agent.action.start', ({ tool, args }) => {
    console.log(`  ↳ tool ${tool} call`, args);
  });
  agent.on('agent.action.end', ({ tool, ms }) => {
    console.log(`  ↳ tool ${tool} ok in ${ms}ms`);
  });

  try {
    const t0 = Date.now();
    const result = await agent.run(prompt);
    const ms = Date.now() - t0;
    if (!result) {
      console.log('(agent returned null result)');
      return;
    }
    console.log('\n=== output ===');
    console.log(result.text);
    console.log(`\nlatency: ${ms}ms · model: ${result.model} · tee_verified: ${result.attestation.teeVerified}`);
    console.log(
      `billing: in=${result.billing.inputCost} wei  out=${result.billing.outputCost} wei  total=${result.billing.totalCost} wei`,
    );
  } finally {
    await agent.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
