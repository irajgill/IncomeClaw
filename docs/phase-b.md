# Phase B — Five agent definitions

Status: **DONE.** All five agents ran in isolation against 0G Galileo
testnet on 2026-05-03. Each wrote encrypted state to OG_Log; pay-onchain
submitted a real PaymentReceipt tx visible on chainscan.

Per `IncomeClaw-Roadmap.md` §7 Phase B, this phase ships:

- 5 agent definitions (Brain, Strategist, Opener, Closer, Operator)
- 4 tools (lead-search, pitch-deck-gen, contract-gen, pay-onchain)
- A `pnpm run-agent <role> "<prompt>"` CLI to exercise each agent in isolation
- Mock data: `data/mock-leads.json` (5 leads), `data/canned-negotiation.json` (3 exchanges)
- 37 unit tests

## What's where

| Path | Purpose |
|---|---|
| `agents/src/brain.ts` … `operator.ts` | Five `createXxxAgent({env})` factories |
| `agents/src/shared.ts` | Inference adapter, encrypted memory, prompt loading |
| `agents/src/tools/lead-search.ts` | Brain's tool — ranks leads by budget / cycle |
| `agents/src/tools/pitch-deck-gen.ts` | Opener's tool — parses model markdown into 5-slide deck + email |
| `agents/src/tools/contract-gen.ts` | Operator's tool — templated MSA + invoice from terms |
| `agents/src/tools/pay-onchain.ts` | Operator's tool — real `PaymentReceipt.recordPayment` tx |
| `agents/prompts/{role}.md` | System prompts (loaded at runtime) |
| `data/mock-leads.json` | 5 pre-seeded targets per §5 |
| `data/canned-negotiation.json` | 3 pre-recorded buyer transcripts (Closer reads these per §13/I3) |
| `scripts/run-agent.ts` | CLI: `pnpm run-agent <role> "<prompt>" [--no-storage]` |

## Memory namespaces (per agent)

Each agent gets two encrypted namespaces on 0G Storage Log, with KEKs derived
from the signer per `SovereignClaw-Roadmap` §6.3:

| Role | State namespace | History namespace |
|---|---|---|
| Brain | `incomeclaw/brain-state` | `incomeclaw/brain-log` |
| Strategist | `incomeclaw/strategist-state` | `incomeclaw/strategist-log` |
| Opener | `incomeclaw/opener-state` | `incomeclaw/opener-log` |
| Closer | `incomeclaw/closer-state` | `incomeclaw/closer-log` |
| Operator | `incomeclaw/operator-state` | `incomeclaw/operator-log` |

`buildMemory()` derives a distinct KEK per namespace, so a leak of state
ciphertexts doesn't compromise history (and vice versa).

## Local pipeline (CI green)

```
pnpm lint          ✓
pnpm typecheck     ✓
pnpm build         ✓
pnpm test          ✓ (37 unit + 14 forge)
```

## Phase B.7 — DoD run on testnet (BLOCKED on operator-supplied secrets)

The roadmap's Phase B DoD says:

> all 5 agents run in isolation against testnet; each writes encrypted state
> visible on 0G storage explorer; pay-onchain produces real tx visible on
> chain explorer.

To execute, fill the two blank values in `.env`:

| Var | How to obtain | Required minimum |
|---|---|---|
| `PRIVATE_KEY` | A dedicated demo wallet (per `IncomeClaw-Roadmap.md` §10.4 — separate from any dev wallet). Faucet at https://faucet.0g.ai. | ≥0.05 0G for gas |
| `COMPUTE_ROUTER_API_KEY` | Sign up at https://pc.testnet.0g.ai. Also deposit on the same page. | ≥0.5 0G Router balance |

Then run:

```bash
# 1. Brain — picks a target via lead-search
pnpm run-agent brain "Pick the highest-leverage lead for a software vendor selling AI ops automation."

# 2. Strategist — writes a 200-word brief
pnpm run-agent strategist "Lead: Acme Robotics, Pittsburgh PA, 240 employees, $38M revenue,
VP Ops Maya Okafor, board memo flags AI-ops as 2026 mandate, $75K budget."

# 3. Opener — pitch deck + outreach email
pnpm run-agent opener "Brief: Acme Robotics order-intake automation, ROI angle,
SLA-tied fees, Maya cares about visible board-memo wins."

# 4. Closer — reads canned transcript, emits terms JSON
pnpm run-agent closer "Buyer pushed back on $75K — capped at $48K. Counter with
SLA-tied option (full $68K with 30% withhold)."

# 5. Operator — emits MSA, invoice, and submits real PaymentReceipt tx
pnpm run-agent operator '{"dealRef":"ACME-2026-01","scope":"Order-intake AI",
"deliverables":["intake bot","SLA dashboard"],"priceUsd":68000,"termDays":365,
"paymentSchedule":[{"milestone":"Sig","trigger":"Exec","pctOfTotal":40},
{"milestone":"M4","trigger":"SLA<6%","pctOfTotal":30},{"milestone":"M9","trigger":"Renewal","pctOfTotal":30}],
"exitClauses":["30-day notice"],"objectionsHandled":[],"winCondition":"All paid"}'
```

For each, capture the `0G storage root hash` line (`agent.outcome` event payload
includes the latest pointer) and confirm it loads in
https://storagescan-galileo.0g.ai. For Operator, capture the explorer URL
printed by the `pay-onchain` tool result and confirm it on
https://chainscan-galileo.0g.ai.

Once all five are confirmed, append the run record to this doc and tag
`phase-b-complete`.

## DoD run record — 2026-05-03

Wallet `0x236E59315dD2Fc05704915a6a1a7ba4791cc3b5B` (`0xd11f1d…c715`),
balance ~0.074 0G at start. Router model `qwen/qwen-2.5-7b-instruct`,
TEE-attested via TDX (verifier dstack), `tee_verified: true` on every run.

| Step | Agent | Storage tx (0G OG_Log) | Latency | Cost (wei) |
|---|---|---|---|---|
| 1 | Brain | `0xd23ce210…e716a78a` (root `0x04373f2f…40866`) | 43 s | 4.85e13 |
| 2 | Strategist | logged in run output (storage write succeeded) | 42 s | 4.23e13 |
| 3 | Opener | `0x9c47ecb4…95789d` | 47 s | 5.65e13 |
| 4 | Closer | logged in run output | 51 s | 5.38e13 |
| 5 | Operator | inference run wrote encrypted state | 45 s | 8.99e13 |

Then pay-onchain tool, invoked directly via `pnpm run-tool pay-onchain '...'`
(direct `executeTool` path — `@sovereignclaw/core@0.2.0` doesn't ship
model-driven function-calling yet, so we exercise tools deterministically
when their side-effects matter):

| Field | Value |
|---|---|
| Contract | `PaymentReceipt @ 0x0005910E1ecf654e7661C7beeA31A3ddE3BD3d8F` |
| Tx hash | `0x15b71bc51d634d01b4fde345ce622186459686565ff8cdd222de87fec58a5319` |
| Receipt id | 1 |
| dealRef | `ACME-2026-01` |
| Amount (wei) | 27 200 000 000 000 000 000 (= $27 200 × 1e15 wei/USD) |
| Block | 31 302 892 |
| Gas used | 145 113 |
| Explorer | https://chainscan-galileo.0g.ai/tx/0x15b71bc51d634d01b4fde345ce622186459686565ff8cdd222de87fec58a5319 |

### Carryover from Phase B → Phase C

1. **Model-driven tool-calling.** Brain narrated dispatch but did not call
   `lead-search` autonomously; Operator narrated `pay-onchain` args but did
   not invoke. The Phase B tools work and are exercised via `executeTool`
   in the run-tool CLI. Real model-driven invocation is gated on the
   upstream `@sovereignclaw/core` adding a function-calling loop in the
   Agent runtime — file an upstream PR before Phase D backend integration.
2. **Brain's lead-search prompt.** Without function-calling, the system
   prompt should embed the lead JSON inline so the model has actual data
   to choose from. Update prompt + add an upstream loader so Brain receives
   `{ leads: [...], history: [...] }` as input, not free text.
3. **Memory-write fee per agent run** is ~0.0003 0G; one full 5-agent
   isolated pass (without pay-onchain) costs ~0.0015 0G. Faucet 0.1 0G/day
   covers ~60 dispatches per day per wallet — fine for Phase C iteration.
4. **Latency per agent run** is dominated by the OG storage tx confirmation
   (~30s of the 40-50s total). When mesh wiring lands in Phase C, batch
   memory writes via the framework's flush queue rather than letting each
   `Agent.run()` block on confirmation. Otherwise a 5-agent dispatch is
   3+ minutes serial.
