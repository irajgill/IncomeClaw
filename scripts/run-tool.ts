// scripts/run-tool.ts
//
// Direct tool invocation CLI. Used to exercise pay-onchain (and the other
// Phase B tools) deterministically when the Agent runtime's model-driven
// function-calling loop isn't shipped yet (deferred to SovereignClaw Phase 2
// per the dev-log).
//
// Usage:
//   pnpm run-tool pay-onchain   '{"agentTokenId":"0","payer":"0x...","amountUsd":27200,"dealRef":"ACME-2026-01"}'
//   pnpm run-tool lead-search   '{}'
//   pnpm run-tool contract-gen  '{"terms":{...},"buyerCompany":"Acme"}'
//   pnpm run-tool pitch-deck-gen '{"rawMarkdown":"...","dealRef":"X"}'
//
// JSON args go through the same Zod validation the Agent runtime would apply.

import 'dotenv/config';
import { JsonRpcProvider, Wallet } from 'ethers';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { executeTool, type Tool } from '@sovereignclaw/core';
import {
  contractGenTool,
  leadSearchTool,
  payOnChainTool,
  pitchDeckGenTool,
} from '../agents/src/index.js';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env: ${name}`);
  return v;
}

async function loadPaymentReceiptAddress(): Promise<string> {
  const path = join(process.cwd(), 'deployments', '0g-testnet.json');
  const raw = JSON.parse(await readFile(path, 'utf8'));
  const addr = raw?.contracts?.paymentReceipt?.address;
  if (!addr) throw new Error(`paymentReceipt address missing from ${path}`);
  return addr;
}

interface ParsedArgs {
  toolName: string;
  rawJson: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  if (args.length < 2) {
    throw new Error(
      "usage: pnpm run-tool <pay-onchain|lead-search|contract-gen|pitch-deck-gen> '<json-args>'",
    );
  }
  const [toolName, ...rest] = args;
  return { toolName: toolName!, rawJson: rest.join(' ') };
}

// JSON revival: turn { agentTokenId: "<digits>" } into bigint.
// pay-onchain's schema demands z.bigint(); JSON.parse can't do that on its own.
/** Keys whose string values are converted to BigInt before validation. */
const BIGINT_KEYS = new Set(['agentTokenId']);

function reviveBigints(value: unknown, key?: string): unknown {
  if (key && BIGINT_KEYS.has(key) && typeof value === 'string' && /^\d+$/.test(value)) {
    return BigInt(value);
  }
  if (Array.isArray(value)) return value.map((v) => reviveBigints(v));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, reviveBigints(v, k)]),
    );
  }
  return value;
}

async function buildTool(name: string): Promise<Tool> {
  switch (name) {
    case 'lead-search':
      return leadSearchTool() as Tool;
    case 'pitch-deck-gen':
      return pitchDeckGenTool() as Tool;
    case 'contract-gen':
      return contractGenTool() as Tool;
    case 'pay-onchain': {
      const provider = new JsonRpcProvider(
        process.env['RPC_URL'] ?? 'https://evmrpc-testnet.0g.ai',
      );
      const signer = new Wallet(requireEnv('PRIVATE_KEY'), provider);
      const contractAddress =
        process.env['PAYMENT_RECEIPT_ADDRESS'] ?? (await loadPaymentReceiptAddress());
      return payOnChainTool({ signer, contractAddress }) as Tool;
    }
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

async function main(): Promise<void> {
  const { toolName, rawJson } = parseArgs(process.argv);
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (e) {
    throw new Error(`invalid JSON args: ${(e as Error).message}\n  raw: ${rawJson}`);
  }
  const args = reviveBigints(parsed);
  console.log(`▸ tool: ${toolName}`);
  console.log(`  args: ${JSON.stringify(parsed, null, 2)}`);

  const tool = await buildTool(toolName);
  const t0 = Date.now();
  const result = await executeTool(tool, args);
  const ms = Date.now() - t0;

  console.log(`\n=== result (${ms}ms) ===`);
  console.log(
    JSON.stringify(
      result,
      (_k, v) => (typeof v === 'bigint' ? v.toString() : v),
      2,
    ),
  );
}

main().catch((e) => {
  console.error('run-tool failed:', e);
  process.exit(1);
});
