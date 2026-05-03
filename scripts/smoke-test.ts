// scripts/smoke-test.ts
//
// Phase A integration smoke. Three real testnet round-trips:
//
//   1. Compute Router  — Agent.run("PONG") via sealed0GInference,
//                        verify_tee: true requested.
//   2. 0G Storage      — upload 1 KB blob, download by root hash, byte-compare.
//   3. 0G Chain        — ethers JsonRpcProvider.getBlockNumber().
//
// All three must pass for `pnpm smoke` to exit 0. If any step fails, the
// preceding successes are still logged so the operator can localize the break.

import { writeFile, readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Agent, sealed0GInference } from '@sovereignclaw/core';
import { Indexer, MemData } from '@0gfoundation/0g-ts-sdk';
import { ethers, JsonRpcProvider, Wallet } from 'ethers';
import { pino } from 'pino';
import { loadEnv } from '../lib/env.js';

const log = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l' } },
});

interface StepResult {
  name: string;
  ok: boolean;
  ms: number;
  details: Record<string, unknown>;
  error?: { name: string; message: string };
}

async function timed<T>(name: string, fn: () => Promise<T>): Promise<{ ok: true; ms: number; value: T } | { ok: false; ms: number; error: Error }> {
  const start = Date.now();
  try {
    const value = await fn();
    return { ok: true, ms: Date.now() - start, value };
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e));
    return { ok: false, ms: Date.now() - start, error };
  }
}

async function stepCompute(env: ReturnType<typeof loadEnv>): Promise<StepResult> {
  log.info('1/3 — Compute Router (qwen/qwen-2.5-7b-instruct, verify_tee: true)…');

  const inference = sealed0GInference({
    model: 'qwen/qwen-2.5-7b-instruct',
    apiKey: env.COMPUTE_ROUTER_API_KEY,
    baseUrl: env.COMPUTE_ROUTER_BASE_URL,
    verifiable: true,
    timeoutMs: 30_000,
    retries: { count: 1, backoffMs: 2_000 },
  });

  const agent = new Agent({
    role: 'smoke',
    inference,
    systemPrompt: 'You are a test harness. Reply with exactly one uppercase word, no punctuation.',
  });

  const r = await timed('compute', () => agent.run('Reply with the single word: PONG'));
  await agent.close();

  if (!r.ok) return stepFail('compute', r.ms, r.error);
  if (!r.value) return stepFail('compute', r.ms, new Error('agent.run returned null'));

  const text = r.value.text.trim();
  return {
    name: 'compute',
    ok: true,
    ms: r.ms,
    details: {
      model: r.value.model,
      response: text,
      // Record whichever shape the Router returned. Phase 0 noted this field's
      // exact location was uncertain — log everything so future work can pin it.
      attestation: r.value.attestation,
      usage: r.value.usage,
      latencyMs: r.value.latencyMs,
    },
  };
}

async function stepStorage(env: ReturnType<typeof loadEnv>): Promise<StepResult> {
  log.info('2/3 — 0G Storage (upload + download 1 KB with proof verification)…');

  const provider = new JsonRpcProvider(env.RPC_URL);
  const signer = new Wallet(env.PRIVATE_KEY, provider);

  const indexer = new Indexer(env.INDEXER_URL);

  // 1 KB random payload — keeps the storage fee around the Phase 0 measurement
  // (~0.000123 0G per 1KB).
  const payload = randomBytes(1024);
  const memFile = new MemData(Array.from(payload));

  // SDK ships ethers v5 types; runtime works against v6 with one cast at the
  // upload boundary. See SovereignClaw §0 risk #19.
  const upload = await timed('upload', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [res, err] = await indexer.upload(memFile as any, env.RPC_URL, signer as any);
    if (err) throw err;
    if (!res) throw new Error('upload returned no result');
    if ('rootHash' in res) {
      return { txHash: res.txHash, rootHash: res.rootHash };
    }
    return { txHash: res.txHashes[0], rootHash: res.rootHashes[0] };
  });
  if (!upload.ok) return stepFail('storage', upload.ms, upload.error);
  const { txHash, rootHash } = upload.value;
  log.info({ txHash, rootHash, ms: upload.ms }, '  upload ok');

  const tmpPath = join(tmpdir(), `incomeclaw-smoke-${Date.now()}.bin`);
  const download = await timed('download', async () => {
    const err = await indexer.download(rootHash, tmpPath, true);
    if (err) throw err;
  });
  if (!download.ok) return stepFail('storage', upload.ms + download.ms, download.error);
  log.info({ rootHash, ms: download.ms, path: tmpPath }, '  download ok');

  const downloaded = await readFile(tmpPath);
  await unlink(tmpPath).catch(() => {});

  if (downloaded.length !== payload.length) {
    return stepFail('storage', upload.ms + download.ms, new Error(`size mismatch: uploaded ${payload.length}, downloaded ${downloaded.length}`));
  }
  if (!downloaded.equals(payload)) {
    return stepFail('storage', upload.ms + download.ms, new Error('byte mismatch after round-trip'));
  }

  return {
    name: 'storage',
    ok: true,
    ms: upload.ms + download.ms,
    details: {
      bytes: payload.length,
      rootHash,
      uploadTxHash: txHash,
      uploadMs: upload.ms,
      downloadMs: download.ms,
      storageExplorer: `${env.STORAGE_EXPLORER_URL}/tx/${txHash}`,
      txExplorer: `${env.EXPLORER_URL}/tx/${txHash}`,
    },
  };
}

async function stepChain(env: ReturnType<typeof loadEnv>): Promise<StepResult> {
  log.info('3/3 — 0G Chain (getBlockNumber + balance check)…');

  const provider = new JsonRpcProvider(env.RPC_URL);
  const signer = new Wallet(env.PRIVATE_KEY, provider);

  const r = await timed('chain', async () => {
    const [blockNumber, balance, network] = await Promise.all([
      provider.getBlockNumber(),
      provider.getBalance(signer.address),
      provider.getNetwork(),
    ]);
    return { blockNumber, balance, network };
  });
  if (!r.ok) return stepFail('chain', r.ms, r.error);

  return {
    name: 'chain',
    ok: true,
    ms: r.ms,
    details: {
      chainId: r.value.network.chainId.toString(),
      blockNumber: r.value.blockNumber,
      wallet: signer.address,
      balanceWei: r.value.balance.toString(),
      balanceEther: ethers.formatEther(r.value.balance),
    },
  };
}

function stepFail(name: string, ms: number, err: Error): StepResult {
  return {
    name,
    ok: false,
    ms,
    details: {},
    error: { name: err.name, message: err.message },
  };
}

async function main() {
  log.info('IncomeClaw — Phase A integration smoke');
  const env = loadEnv();

  const results: StepResult[] = [];
  results.push(await stepCompute(env));
  results.push(await stepStorage(env));
  results.push(await stepChain(env));

  for (const r of results) {
    if (r.ok) {
      log.info({ step: r.name, ms: r.ms, ...r.details }, `  ${r.name} OK`);
    } else {
      log.error({ step: r.name, ms: r.ms, error: r.error }, `  ${r.name} FAILED`);
    }
  }

  const allOk = results.every((r) => r.ok);
  if (!allOk) {
    log.error('Smoke FAILED — see steps above.');
    process.exit(1);
  }

  // Summary report — easy to grep for in CI logs.
  await writeFile(
    'scripts/smoke-test.last.json',
    JSON.stringify(
      { timestamp: new Date().toISOString(), results },
      (_, v) => (typeof v === 'bigint' ? v.toString() : v),
      2,
    ),
  );
  log.info('Smoke OK — all three steps green. Report written to scripts/smoke-test.last.json.');
}

main().catch((e) => {
  log.error({ err: e }, 'unhandled');
  process.exit(1);
});
