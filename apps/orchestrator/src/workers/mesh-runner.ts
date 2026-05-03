// apps/orchestrator/src/workers/mesh-runner.ts
//
// BullMQ consumer that picks up brief jobs and runs them through the
// IncomeMesh defined in @incomeclaw/agents. Per IncomeClaw-Roadmap.md §7
// Phase C deliverable.
//
// Lifecycle:
//   1. Worker boots when the orchestrator starts (if ENABLE_MESH=1).
//   2. For each job: build a wallet/signer, instantiate createIncomeMesh,
//      dispatch the brief, capture pointers + scores, return BriefJobResult.
//   3. On error: BullMQ marks the job failed and surfaces the error via
//      `events.failed` — the durable mesh bus on 0G remains intact, so a
//      subsequent worker run can resume by reading mesh.bus.replay() with
//      the same meshId.
//
// Replay strategy (Phase C.3): each job's BullMQ jobId IS the meshId. If
// the worker dies mid-task, BullMQ will redeliver after stalledInterval;
// the new worker constructs a mesh with the same meshId, which lazily
// rehydrates from the existing OG_Log namespace. The replay test exercises
// this end-to-end.

import { Worker, type Job } from 'bullmq';
import { JsonRpcProvider, Wallet } from 'ethers';
import { createIncomeMesh, type AgentEnv } from '@incomeclaw/agents';
import { loadEnv } from '../env.js';
import { logger } from '../logger.js';
import { MeshDispatchError, MeshUnavailableError } from '../errors.js';
import {
  BRIEF_QUEUE,
  buildRedisConnection,
  type BriefJobData,
  type BriefJobResult,
} from '../queue.js';

function buildAgentEnv(): AgentEnv {
  const env = loadEnv();
  if (!env.PRIVATE_KEY) {
    throw new MeshUnavailableError(
      'mesh-runner: PRIVATE_KEY is unset. Set it in .env (funded Galileo wallet).',
    );
  }
  if (!env.COMPUTE_ROUTER_API_KEY) {
    throw new MeshUnavailableError(
      'mesh-runner: COMPUTE_ROUTER_API_KEY is unset. Sign up at https://pc.testnet.0g.ai.',
    );
  }
  const provider = new JsonRpcProvider(env.RPC_URL);
  const signer = new Wallet(env.PRIVATE_KEY, provider);
  const agentEnv: AgentEnv = {
    signer,
    rpcUrl: env.RPC_URL,
    indexerUrl: env.INDEXER_URL,
    routerApiKey: env.COMPUTE_ROUTER_API_KEY,
    model: env.COMPUTE_MODEL,
    persist: true,
  };
  if (env.COMPUTE_ROUTER_BASE_URL) {
    agentEnv.routerBaseUrl = env.COMPUTE_ROUTER_BASE_URL;
  }
  return agentEnv;
}

async function runJob(job: Job<BriefJobData, BriefJobResult>): Promise<BriefJobResult> {
  const t0 = Date.now();
  const { brief, taskId } = job.data;
  // The BullMQ jobId is the canonical taskId; we mirror it into the meshId
  // so a re-delivered job rehydrates the same OG_Log mesh-bus namespace.
  const meshId = taskId;
  logger.info({ jobId: job.id, taskId, briefLen: brief.length }, 'brief job picked up');

  const env = loadEnv();
  const agentEnv = buildAgentEnv();
  const incomeMesh = await createIncomeMesh({
    env: agentEnv,
    paymentReceiptAddress: env.PAYMENT_RECEIPT_ADDRESS,
    meshId,
  });
  try {
    const result = await incomeMesh.dispatch(brief);
    const totalMs = Date.now() - t0;
    logger.info(
      {
        jobId: job.id,
        taskId,
        meshId: result.meshId,
        rounds: result.pec.rounds,
        score: result.pec.score,
        acceptedExecutor: result.pec.acceptedExecutor,
        busPointers: result.busEventPointers.length,
        totalMs,
      },
      'brief job complete',
    );
    return { ...result, totalMs };
  } catch (cause) {
    logger.error({ jobId: job.id, taskId, err: cause }, 'brief job failed');
    throw new MeshDispatchError(taskId, cause);
  } finally {
    await incomeMesh.close().catch((err) => {
      logger.warn({ taskId, err }, 'mesh close raised — ignoring');
    });
  }
}

/**
 * Start the mesh-runner worker. Returns the worker so the caller can
 * await its close() during shutdown.
 *
 * Concurrency is intentionally 1 — five-agent dispatches are ~3 minutes
 * serial today (per Phase B carryover #4) and the worker holds a single
 * 0G signer; running multiple in parallel would race nonces.
 */
export function startMeshRunner(): Worker<BriefJobData, BriefJobResult> {
  const connection = buildRedisConnection();
  const worker = new Worker<BriefJobData, BriefJobResult>(BRIEF_QUEUE, runJob, {
    connection,
    concurrency: 1,
    // BullMQ default stalledInterval is 30s — fine for our long mesh runs.
    // If a worker dies mid-task, the same job is re-delivered after
    // (stalledInterval × maxStalledCount). The new worker resumes via
    // matching meshId.
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'brief job failed (worker event)');
  });
  worker.on('error', (err) => {
    logger.error({ err }, 'mesh-runner worker error');
  });
  return worker;
}
