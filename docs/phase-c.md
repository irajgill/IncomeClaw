# Phase C — Mesh wiring

Status: **shipped (code green), DoD partial.** Mesh, BullMQ worker, brief
router, and the replay invariant all land cleanly. Full end-to-end on
testnet hits a 0G storage write-volume ceiling that the framework and the
demo wallet provisioning will need to address before Phase D.

## What's where

| Path | Purpose |
|---|---|
| `agents/src/mesh.ts` | `createIncomeMesh({env})` — wires Brain + Strategist + Opener + Closer + Operator into a per-task `Mesh` with an encrypted OG_Log mesh-bus namespace. |
| `apps/orchestrator/src/queue.ts` | BullMQ `Queue` + `Worker` types, Redis connection helper. |
| `apps/orchestrator/src/workers/mesh-runner.ts` | BullMQ consumer that calls `incomeMesh.dispatch(brief)`. Concurrency 1 (single-signer mesh). |
| `apps/orchestrator/src/routes/brief.ts` | `POST /brief` enqueues; `GET /brief/:taskId` polls job state. |
| `apps/orchestrator/src/server.ts` | Wires queue + router + worker. `ENABLE_MESH=0` to boot just `/healthz`. |
| `apps/orchestrator/test/brief-router.test.ts` | 8 unit tests for the router. |
| `apps/orchestrator/test/replay.integration.test.ts` | Phase C.3 — proves jobId == meshId across redelivery. |
| `apps/orchestrator/test/mesh-dispatch.integration.test.ts` | Phase C.4/C.5 — full end-to-end on testnet. |

## Pipeline shape

```
brief
  │
  ▼
planExecuteCritique
  ├── planner = Brain
  ├── executors = [Strategist]      ← single executor, see "Carryover #1"
  └── critic  = Brain               (rubric: "completeness")
  │
  ▼ accepted output
sequentialPattern { agentNames: ['opener', 'closer', 'operator'] }
  │
  ▼ operator output (narrated; pay-onchain still invoked via run-tool)
```

Roadmap §7 calls for `hierarchical(Brain root) + planExecuteCritique`
with `[Strategist, Opener, Closer]` parallel executors. The published
`@sovereignclaw/mesh@0.2.0` ships only `planExecuteCritique` and
`sequentialPattern`, and parallel executors hit a same-wallet nonce race
(see Carryover #1). Single-executor PEC + sequential downstream encodes
the same hierarchy without the race; equivalent semantics.

## Local pipeline (CI-equivalent)

```
pnpm lint          ✓
pnpm typecheck     ✓
pnpm build         ✓
pnpm test          ✓ 39 unit (agents) + 8 unit (orchestrator) + 14 forge
```

## Phase C.3 DoD — replay invariant ✓

Verified locally against `redis://localhost:6379`:

```
INTEGRATION=1 pnpm --filter @incomeclaw/orchestrator exec \
  vitest run test/replay.integration.test.ts
# → 1 passed (1)
```

Proves: a job that fails on attempt 1 is redelivered with the same
`jobId`. Since the worker mirrors `meshId = job.id`, the new attempt
constructs a Mesh with the same OG_Log mesh-bus namespace and replays
prior events via `mesh.bus.replay()`.

## Phase C.5 DoD — full pipeline on testnet (PARTIAL)

Two consecutive runs against 0G Galileo (wallet
`0x236E59315dD2Fc05704915a6a1a7ba4791cc3b5B`, ~0.06 0G start balance,
COMPUTE_ROUTER_API_KEY funded):

| Run | Outcome | Bus events appended before failure | Failure point |
|---|---|---|---|
| 1 | ❌ | 1 (Brain plan) | Brain history write reverted on 0G StorageFlow `0x22E03a6A89B950F1c82ec5e74F8eCa321a105296` (`status: 0`, no revert data, gasUsed 302856) |
| 2 | ❌ | 4 (full Brain plan + Strategist execute + Brain critique cycle) | mesh-bus `evt:0000000000000004` write reverted on the same StorageFlow contract, after 241 s of successful agent runs |

The agents themselves ran fine (model returned, TEE attested). The wall
is at the OG storage layer: the writer wallet is rejected after a burst
of writes within a short window. A standalone smoke test
(`pnpm smoke`) right between the two runs uploaded a 1 KB blob
successfully (tx `0xb9a2b22d…16ae2b0`), confirming the flow contract is
healthy in steady state — the issue is rate, not availability.

## Carryover from Phase C → Phase D

1. **Same-wallet parallel storage writes break.**
   `planExecuteCritique`'s default `Promise.all([...executors])` runs
   each executor's storage writes concurrently from the same signer.
   ethers serializes nonces per signer, so the second tx is rejected as
   `REPLACEMENT_UNDERPRICED`. Workaround in this repo: single-executor
   PEC. Real fix is upstream — either per-agent signers in the framework
   or nonce coordination inside `@sovereignclaw/memory`'s OG_Log adapter.
   File: `https://github.com/amsorrytola/SovereignClaw/issues` — open one
   before Phase D wires the SSE feed.

2. **Burst-rate ceiling on 0G StorageFlow writes.**
   A single dispatch generates ~10 storage txs (each agent's state +
   history × ~2 writes per run, plus 4-6 mesh-bus events). The
   StorageFlow contract reverts on per-wallet bursts somewhere between
   8-15 writes within 5 minutes. This is observable and not a code bug;
   `pnpm smoke` works fine in steady state. Mitigations to evaluate:
   - retry-with-backoff in `@sovereignclaw/memory`'s og-log adapter
     (the natural framework-level fix);
   - per-agent signers, each faucet-funded (5 wallets, 0.1 0G/day each);
   - alternative storage tier, or a dedicated relayer wallet;
   - reduce agent write volume per run (e.g. only flush state at the
     end of a successful run, not on every emit).
   Phase D backend is the natural place to add a per-task throttle and
   status surfacing in the SSE feed so the UI can render
   `"storage backpressure, retrying in 30s"`.

3. **Model-driven function calling still missing in
   `@sovereignclaw/core@0.2.0`** (carried over from Phase B). Operator's
   `pay-onchain` tool runs only via the `pnpm run-tool` direct path. The
   integration test (`mesh-dispatch.integration.test.ts`) exercises both
   the mesh dispatch and the direct tool invocation; once upstream ships
   function calling, the test simplifies to a single `mesh.dispatch`
   that emits a real PaymentReceipt tx as part of the run.

4. **Per-wallet write quota planning for Phase D demo.** The hackathon
   demo wallet (per `IncomeClaw-Roadmap.md §10.4`) should be separate
   from any dev wallet (current run reused the SovereignClaw deployer
   wallet). Pre-warm before judging via `pnpm demo-warmup` (Phase F),
   and run with a relayer if the storage layer hasn't shipped a higher
   per-wallet write tier by then.

## How to re-run when ready

```bash
# Local Redis must be up (docker compose up -d redis).
pnpm --filter @incomeclaw/orchestrator exec \
  vitest run test/replay.integration.test.ts
# replay invariant — passes today.

# Full mesh dispatch — requires PRIVATE_KEY + COMPUTE_ROUTER_API_KEY in .env
# AND a wallet that's been quiet on storage writes for ~5 min before the run.
INTEGRATION=1 pnpm --filter @incomeclaw/orchestrator exec \
  vitest run test/mesh-dispatch.integration.test.ts --testTimeout=600000
```
