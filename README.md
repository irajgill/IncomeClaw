# IncomeClaw

> Five sovereign agents on 0G — built on [SovereignClaw](https://www.npmjs.com/org/sovereignclaw).
> Track 2 reference implementation for the ETHGlobal 0G hackathon.

[![CI](https://github.com/amsorrytola/IncomeClaw/actions/workflows/ci.yml/badge.svg)](https://github.com/amsorrytola/IncomeClaw/actions/workflows/ci.yml)
[![gitleaks](https://github.com/amsorrytola/IncomeClaw/actions/workflows/gitleaks.yml/badge.svg)](https://github.com/amsorrytola/IncomeClaw/actions/workflows/gitleaks.yml)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
![Phase](https://img.shields.io/badge/phase-A%20complete-green)
![0G](https://img.shields.io/badge/0G-Galileo%20testnet-orange)

**Status:** Phase A complete. Phase B (framework streaming PRs) lives in the
[`sovereignclaw`](https://github.com/amsorrytola/SovereignClaw) repo. Phase C
(agent definitions) starts once `@sovereignclaw/core@0.2.0` ships.

---

## What this is

IncomeClaw is a 5-agent autonomous income team — **Brain · Strategist · Opener
· Closer · Operator** — each minted as an ERC-7857 iNFT, each with its own
encrypted memory namespace on 0G Storage, communicating through a shared
SovereignClaw Agent Mesh. Brain hunts; Strategist researches; Opener pitches;
Closer negotiates; Operator settles — every step on-chain, every thought
streamed to the UI, every memory cryptographically revocable.

Phase A ships the foundation: workspace scaffold, no-internal-reach lint guard,
CI, the `PaymentReceipt` contract on 0G Galileo, framework + Tavily integration
smokes, and a docker-compose stack the orchestrator runs in.

## Deployed addresses (0G Galileo, chain id 16602)

| Contract            | Address                                                                                                                                       | Phase                  |
|---------------------|-----------------------------------------------------------------------------------------------------------------------------------------------|------------------------|
| `AgentNFT`          | [`0xc3f997545da4AA8E70C82Aab82ECB48722740601`](https://chainscan-galileo.0g.ai/address/0xc3f997545da4AA8E70C82Aab82ECB48722740601)            | sovereignclaw v0.1.0   |
| `MemoryRevocation`  | [`0x735084C861E64923576D04d678bA2f89f6fbb6AC`](https://chainscan-galileo.0g.ai/address/0x735084C861E64923576D04d678bA2f89f6fbb6AC)            | sovereignclaw v0.1.0   |
| **`PaymentReceipt`**| **[`0x0005910E1ecf654e7661C7beeA31A3ddE3BD3d8F`](https://chainscan-galileo.0g.ai/address/0x0005910E1ecf654e7661C7beeA31A3ddE3BD3d8F)**       | **incomeclaw A4**      |

`PaymentReceipt` deploy tx: [`0x34fb50dafae685354fd35562b5e4b4a7cc0d45aa8a42187dbf50757c30f8243b`](https://chainscan-galileo.0g.ai/tx/0x34fb50dafae685354fd35562b5e4b4a7cc0d45aa8a42187dbf50757c30f8243b) (block 31273711, 561 052 gas).
Verification on chainscan-galileo is currently a manual flow — the explorer
exposes no programmatic Blockscout API yet. See [`contracts/README.md`](contracts/README.md#verification-on-0g-chainscan).

The full registry lives at [`deployments/0g-testnet.json`](deployments/0g-testnet.json).

## Quickstart

```bash
git clone https://github.com/amsorrytola/IncomeClaw.git
cd IncomeClaw

cp .env.example .env                    # then edit the placeholders — see below
pnpm install                            # workspace deps
pnpm forge:bootstrap                    # foundry libs (forge-std + OZ@v5.1.0)

# Validate everything is green:
pnpm lint                               # eslint + no-internal-reach guard
pnpm typecheck                          # tsc --noEmit
pnpm build                              # turbo build
pnpm test                               # vitest unit tests
pnpm forge:test                         # foundry tests

# Hits real 0G Galileo testnet — needs .env populated:
pnpm smoke                              # compute + storage + chain
pnpm smoke:tavily                       # tavily search

# Local stack (orchestrator + redis):
docker compose up -d
curl localhost:8787/healthz             # → {"ok":true,...}
```

`.env` placeholders that MUST be replaced before any smoke run:

| Var                       | Source                                                                  |
|---------------------------|--------------------------------------------------------------------------|
| `PRIVATE_KEY`             | A funded 0G Galileo wallet — https://faucet.0g.ai (0.1 0G/day cap)      |
| `COMPUTE_ROUTER_API_KEY`  | https://pc.testnet.0g.ai → API key + deposit ≥0.5 0G to Router balance |
| `ORACLE_AUTH_TOKEN`       | Operator-provided (the same token your shell uses for SovereignClaw)    |
| `TAVILY_API_KEY`          | Free tier at https://tavily.com (1 000 searches/mo)                     |

Full operator guide: [`docs/local-dev.md`](docs/local-dev.md).

## Architecture (Phase A)

```
incomeclaw/
├── apps/
│   ├── web/                            Next.js 15 dashboard (placeholder this phase)
│   └── orchestrator/                   Hono on Node 22 — /healthz today, full
│                                       routes + BullMQ in Phase E
├── agents/                             Agent definitions (Phase C). Today exports
│                                       only typed errors + the Tavily wrapper.
├── contracts/                          Foundry — PaymentReceipt.sol
├── scripts/                            smoke-test.ts (compute+storage+chain),
│                                       smoke-tavily.ts
├── deployments/0g-testnet.json         Single-source-of-truth contract registry
├── docs/                               local-dev, no-internal-reach
└── eslint.config.js                    Two-layer guard:
                                          • no-restricted-imports against
                                            @sovereignclaw/*/dist|src|internal/**
                                          • eslint-plugin-boundaries cross-pkg
                                            element rules
```

The `@sovereignclaw/*` packages are consumed only via their public entry
specifiers. Reaching into `dist/`, `src/`, or `internal/` is a lint error —
see [`docs/no-internal-reach.md`](docs/no-internal-reach.md).

## Working on this repo

```bash
pnpm dev:orchestrator                   # tsx watch — hot-reloads on src changes
pnpm dev:web                            # next dev — :3000

pnpm format                             # prettier --write
pnpm lint:fix                           # eslint --fix
```

## Phase A — Definition of Done (every box ticked)

- [x] `pnpm install --frozen-lockfile` clean from a fresh clone
- [x] `pnpm lint` exits 0
- [x] `pnpm typecheck` exits 0 across every workspace
- [x] `pnpm build` exits 0 across every workspace
- [x] `pnpm test` exits 0 (unit suite)
- [x] `forge build` and `forge test -vvv` green (14 tests, all pass)
- [x] `pnpm smoke` succeeds against live testnet (1.6 s compute · 28.9 s storage · 0.8 s chain)
- [x] `pnpm smoke:tavily` returns 3 real results in ≈2.3 s
- [x] `PaymentReceipt` deployed to 0G Galileo and recorded in `deployments/0g-testnet.json`. Manual verify path documented since chainscan has no programmatic API.
- [x] `docker compose up` brings orchestrator + redis up clean; `/healthz` returns 200
- [x] `eslint-plugin-boundaries` proven via the [disabled violation example](examples/lint-violations/internal-reach.ts.disabled) — flipping it on triggers 9 errors against 3 lines
- [x] All env vars documented in [`.env.example`](.env.example)
- [x] README quickstart runs verbatim

## What's next

- **Phase B** — upstream `@sovereignclaw/core@0.2.0` + `@sovereignclaw/mesh@0.2.0`
  with streaming inference + per-agent run events. Lives in the
  [`sovereignclaw`](https://github.com/amsorrytola/SovereignClaw) repo. **No
  IncomeClaw work happens until those publish.**
- **Phase C** — `agents/brain.ts` … `operator.ts`, plus `mock-leads.json`.
- **Phase D–F** — mesh wiring, BullMQ, SSE feed, the streaming UI.

See [`IncomeClaw-Roadmap.md`](IncomeClaw-Roadmap.md) for the whole plan.

## License

Apache 2.0 — see [LICENSE](LICENSE) and [NOTICE](NOTICE).
