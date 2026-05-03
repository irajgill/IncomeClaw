// agents/src/shared.ts
//
// Shared agent-construction primitives used by brain/strategist/opener/closer/
// operator factories. The pattern is consistent across the five so the
// run-agent CLI can dispatch generically without per-role plumbing.

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sealed0GInference, type InferenceAdapter } from '@sovereignclaw/core';
import {
  OG_Log,
  encrypted,
  deriveKekFromSigner,
  InMemory,
  type MemoryProvider,
} from '@sovereignclaw/memory';
import type { Signer } from 'ethers';

export type AgentRole = 'brain' | 'strategist' | 'opener' | 'closer' | 'operator';

export interface AgentEnv {
  /** ethers Signer with funded testnet wallet. */
  signer: Signer;
  /** 0G chain RPC URL, e.g. https://evmrpc-testnet.0g.ai */
  rpcUrl: string;
  /** 0G storage indexer, e.g. https://indexer-storage-testnet-turbo.0g.ai */
  indexerUrl: string;
  /** 0G Compute Router API key. From https://pc.testnet.0g.ai */
  routerApiKey: string;
  /** Compute model. Defaults to qwen2.5-7b-instruct. */
  model?: string;
  /** Optional Router base URL override. */
  routerBaseUrl?: string;
  /**
   * If true (the default), use 0G Storage Log for memory + history. If false,
   * use InMemory adapters — useful for unit tests and the run-agent CLI's
   * --no-storage flag, which keeps the demo cheap when iterating on prompts.
   */
  persist?: boolean;
}

/** Default model — settled in Phase 1 dev-log entry; verify_tee: true confirmed.
 *  Router model id format is `qwen/qwen-2.5-7b-instruct` (verify against
 *  GET /v1/models if 503 "no_available_provider" appears). */
export const DEFAULT_MODEL = 'qwen/qwen-2.5-7b-instruct';

/** All five agent memory namespaces — kept here so the dashboard can enumerate them. */
export const NAMESPACES: Record<AgentRole, { state: string; history: string }> = {
  brain: { state: 'incomeclaw/brain-state', history: 'incomeclaw/brain-log' },
  strategist: {
    state: 'incomeclaw/strategist-state',
    history: 'incomeclaw/strategist-log',
  },
  opener: { state: 'incomeclaw/opener-state', history: 'incomeclaw/opener-log' },
  closer: { state: 'incomeclaw/closer-state', history: 'incomeclaw/closer-log' },
  operator: { state: 'incomeclaw/operator-state', history: 'incomeclaw/operator-log' },
};

/**
 * Build the inference adapter for any agent. All five use the same Router
 * config; only system prompt and tools differ.
 */
export function buildInferenceAdapter(env: AgentEnv): InferenceAdapter {
  return sealed0GInference({
    model: env.model ?? DEFAULT_MODEL,
    apiKey: env.routerApiKey,
    baseUrl: env.routerBaseUrl,
    verifiable: true,
  });
}

/**
 * Build a state + history MemoryProvider pair for a given role.
 *
 * - state: encrypted KV-style namespace for the agent's working memory.
 * - history: encrypted append-only log for events / learnings.
 *
 * Both encrypt under a KEK derived from the signer + namespace per
 * SovereignClaw-Roadmap §6.3.
 */
export async function buildMemory(
  env: AgentEnv,
  role: AgentRole,
): Promise<{ state: MemoryProvider; history: MemoryProvider }> {
  const ns = NAMESPACES[role];
  const persist = env.persist ?? true;

  if (!persist) {
    return {
      state: InMemory({ namespace: ns.state }),
      history: InMemory({ namespace: ns.history }),
    };
  }

  // KEK derivation is deterministic per (signer, namespace). The state and
  // history namespaces of the same agent get distinct KEKs, so a leak of one
  // doesn't compromise the other.
  const stateKek = await deriveKekFromSigner(env.signer, ns.state);
  const historyKek = await deriveKekFromSigner(env.signer, ns.history);

  const baseOpts = { rpcUrl: env.rpcUrl, indexerUrl: env.indexerUrl, signer: env.signer };
  const state = encrypted(OG_Log({ namespace: ns.state, ...baseOpts }), { kek: stateKek });
  const history = encrypted(
    OG_Log({ namespace: ns.history, ...baseOpts }),
    { kek: historyKek },
  );
  return { state, history };
}

/**
 * Read a system prompt by role name from agents/prompts/<role>.md.
 *
 * We resolve relative to the source file location so this works whether the
 * package is being run from src (tsx) or from dist (compiled).
 */
export async function loadSystemPrompt(role: AgentRole): Promise<string> {
  const here = dirname(fileURLToPath(import.meta.url));
  // src/shared.ts → ../prompts/<role>.md
  // dist/shared.js → ../prompts/<role>.md (we don't bundle prompts; loaded at runtime)
  const candidates = [
    join(here, '..', 'prompts', `${role}.md`),
    join(here, '..', '..', 'prompts', `${role}.md`),
    join(process.cwd(), 'agents', 'prompts', `${role}.md`),
  ];
  for (const p of candidates) {
    try {
      return await readFile(p, 'utf8');
    } catch {
      // try next
    }
  }
  throw new Error(`loadSystemPrompt: no prompt file found for role ${role} at any of ${candidates.join(', ')}`);
}
