// Shared env loader for repo-root scripts (smoke tests, deploy helpers).
// Apps under apps/* have their own narrower schemas (see e.g. apps/orchestrator/src/env.ts).

import { z } from 'zod';
import 'dotenv/config';

const HexAddress = z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'must be a 0x-prefixed 20-byte address');
const HexPrivateKey = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, 'must be a 0x-prefixed 32-byte private key');

const EnvSchema = z.object({
  // 0G chain + storage
  RPC_URL: z.string().url(),
  INDEXER_URL: z.string().url(),
  CHAIN_ID: z.coerce.number().int().positive().default(16602),
  EXPLORER_URL: z.string().url(),
  STORAGE_EXPLORER_URL: z.string().url(),
  PRIVATE_KEY: HexPrivateKey,

  // Compute Router
  COMPUTE_ROUTER_BASE_URL: z.string().url(),
  COMPUTE_ROUTER_API_KEY: z.string().min(8),

  // Contract addresses
  AGENT_NFT_ADDRESS: HexAddress,
  MEMORY_REVOCATION_ADDRESS: HexAddress,
  PAYMENT_RECEIPT_ADDRESS: HexAddress.optional(),

  // Oracle
  ORACLE_URL: z.string().url(),
  ORACLE_AUTH_TOKEN: z.string().min(1),

  // Tavily
  TAVILY_API_KEY: z.string().min(8),

  // Local services
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Load and validate the full repo-wide env. Throws with a multi-line list of
 * every missing/invalid var if validation fails — fail loud, not late.
 */
export function loadEnv(opts?: { allow?: Array<keyof Env> }): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (parsed.success) return parsed.data;

  const issues = parsed.error.issues
    .filter((i) => !opts?.allow?.includes(i.path[0] as keyof Env))
    .map((i) => `  ${i.path.join('.')}: ${i.message}`);
  if (issues.length === 0 && opts?.allow) {
    // Permitted-missing path: re-parse with partials filled in.
    return EnvSchema.partial().parse(process.env) as Env;
  }
  throw new Error(`Invalid environment configuration:\n${issues.join('\n')}`);
}
