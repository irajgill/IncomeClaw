# Local development

## Prerequisites

- Node 22 LTS (`nvm use 22` if you have nvm)
- pnpm 9.12.0 (`corepack enable && corepack prepare pnpm@9.12.0 --activate`)
- Foundry stable (`curl -L https://foundry.paradigm.xyz | bash && foundryup`)
- Docker 24+ with Compose v2 (`docker compose version` should print v2.x)

## First-time setup

```bash
git clone <repo>
cd IncomeClaw

cp .env.example .env                    # then edit the placeholders
pnpm install                            # workspace deps
pnpm forge:bootstrap                    # forge-std + OpenZeppelin (~30s)
```

`.env` placeholders that MUST be replaced before any smoke runs:

| Var                                  | Where to get it                                                         |
|--------------------------------------|--------------------------------------------------------------------------|
| `PRIVATE_KEY`                        | A funded 0G Galileo wallet — https://faucet.0g.ai (0.1 0G/day cap)      |
| `COMPUTE_ROUTER_API_KEY`             | Create at https://pc.testnet.0g.ai, then deposit ≥0.5 0G to Router      |
| `ORACLE_AUTH_TOKEN`                  | Operator-provided (the `ORACLE_AUTH_TOKEN_PROD` from your shell)        |
| `TAVILY_API_KEY`                     | Free key at https://tavily.com (1,000 searches/mo)                      |

## Daily workflow

```bash
pnpm dev:orchestrator                   # one-off node + tsx watch (no docker)
docker compose up                       # OR full stack: redis + orchestrator
```

The Compose stack publishes:
- Redis on `localhost:6379`
- Orchestrator on `localhost:8787`

Confirm both are alive:

```bash
curl -fsS localhost:8787/healthz
# → {"ok":true,"service":"orchestrator","version":"0.1.0"}

docker compose exec redis redis-cli ping
# → PONG
```

## Useful commands

```bash
pnpm lint                               # ESLint + no-internal-reach guard
pnpm typecheck                          # tsc --noEmit across workspace
pnpm build                              # turbo build (cached)
pnpm test                               # vitest unit tests
pnpm smoke                              # 0G Compute + Storage + Chain (live testnet)
pnpm smoke:tavily                       # Tavily search (live API)
pnpm forge:test                         # Foundry tests
pnpm forge:bootstrap                    # re-fetch forge-std + OZ if lib/ disappears
pnpm deploy:payment-receipt             # broadcast PaymentReceipt to 0G Galileo
```

## Tearing down

```bash
docker compose down                     # stop + remove containers (keeps redis volume)
docker compose down -v                  # also drop the redis volume

# nuke local node_modules + foundry cache:
rm -rf node_modules apps/*/node_modules agents/node_modules contracts/lib contracts/cache contracts/out
```

## Troubleshooting

**`pnpm install` warns about ethers peer dep mismatch.**
Expected. The 0G storage SDK pins `ethers@6.13.1`; we run `6.13.4`. Same minor,
runtime works fine.

**`pnpm smoke` errors `RouterBalanceError`.**
Your Compute Router *contract balance* is empty (≠ wallet balance). Top up at
https://pc.testnet.0g.ai → Deposit. Wallet alone funds storage + gas; Router
balance funds compute. See SovereignClaw §0 risk #21.

**`docker compose up` fails with port already in use.**
Something else is on 6379 or 8787. Either stop it or override in `docker-compose.override.yml`.

**`forge install` complains about an embedded git repo.**
Re-run `pnpm forge:bootstrap` — it strips nested `.git` directories before they
hit the parent index.
