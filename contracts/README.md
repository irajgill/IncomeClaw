# IncomeClaw — contracts

Foundry project. One contract this phase: [`PaymentReceipt`](src/PaymentReceipt.sol) (lands in A4).

## Layout

- `src/` — Solidity 0.8.24 sources
- `test/` — Foundry tests (`forge test -vvv`)
- `script/` — deploy scripts (`forge script`)
- `lib/` — Foundry deps (gitignored); fetch with `pnpm forge:bootstrap` from repo root

## First-time setup on a fresh clone

```bash
pnpm forge:bootstrap     # one-time: forge install forge-std + OZ@v5.1.0
```

## Common commands

```bash
forge build
forge test -vvv
forge snapshot                 # gas snapshot to .gas-snapshot
forge fmt                      # format
forge script script/Deploy.s.sol --rpc-url $RPC_URL --private-key $PRIVATE_KEY --broadcast
```

## Deploy to 0G Galileo

```bash
# From repo root, with .env populated:
pnpm deploy:payment-receipt
```

This runs `forge script script/Deploy.s.sol --broadcast` and updates
`deployments/0g-testnet.json` in place with the new address + block number.
The deploy tx hash is also captured in
`contracts/broadcast/Deploy.s.sol/16602/run-latest.json` (gitignored); copy
it into `deployments/0g-testnet.json` under
`contracts.paymentReceipt.deployTxHash` after the broadcast completes.

## Verification on 0G chainscan

The 0G Galileo explorer at `chainscan-galileo.0g.ai` is Blockscout-flavored.

### Path 1 — Foundry CLI (try first)

```bash
forge verify-contract <address> PaymentReceipt \
  --chain-id 16602 \
  --verifier blockscout \
  --verifier-url https://chainscan-galileo.0g.ai/api/
```

If the verifier URL returns 404, try `--verifier-url https://chainscan-galileo.0g.ai/api?`
(some Blockscout builds want the trailing `?`). If both fail, fall through
to Path 2.

### Path 2 — Manual (fallback)

1. Open `https://chainscan-galileo.0g.ai/address/<address>` in a browser.
2. Click the **Contract** tab → **Verify & Publish**.
3. Compiler: `v0.8.24+commit.e11b9ed9`. Optimization: `Yes`, runs `200`. License: `Apache-2.0`.
4. Paste the contents of `src/PaymentReceipt.sol` (it has no imports).
5. Submit; copy the resulting verified URL into `deployments/0g-testnet.json`
   under `contracts.paymentReceipt.verifiedUrl`.
