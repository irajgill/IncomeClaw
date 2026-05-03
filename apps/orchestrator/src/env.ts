import { z } from 'zod';
import 'dotenv/config';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  // Phase C additions — needed by the mesh-runner worker.
  RPC_URL: z.string().url().default('https://evmrpc-testnet.0g.ai'),
  INDEXER_URL: z
    .string()
    .url()
    .default('https://indexer-storage-testnet-turbo.0g.ai'),
  PRIVATE_KEY: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/, 'PRIVATE_KEY must be a 0x-prefixed 32-byte hex string')
    .optional(),
  COMPUTE_ROUTER_API_KEY: z.string().optional(),
  COMPUTE_ROUTER_BASE_URL: z.string().url().optional(),
  COMPUTE_MODEL: z.string().default('qwen/qwen-2.5-7b-instruct'),
  PAYMENT_RECEIPT_ADDRESS: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .default('0x0005910E1ecf654e7661C7beeA31A3ddE3BD3d8F'),

  /**
   * When true, the orchestrator boots the mesh-runner worker and exposes
   * /brief. Defaults to true. Set ENABLE_MESH=0 to boot just /healthz —
   * useful for unit tests that don't need Redis or for the docker-compose
   * smoke check that only verifies /healthz.
   */
  ENABLE_MESH: z
    .enum(['0', '1'])
    .default('1')
    .transform((v) => v === '1'),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${message}`);
  }
  cached = parsed.data;
  return cached;
}

/** Tests reset the cached env so they can mutate process.env safely. */
export function resetEnvCache(): void {
  cached = null;
}
