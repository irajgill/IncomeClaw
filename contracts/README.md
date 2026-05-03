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

The 0G Galileo explorer at `chainscan-galileo.0g.ai` looks Blockscout-flavored
on the surface but **does not expose a programmatic verification API** on that
host. Probed during A4 (May 2026):

| Endpoint                                                                                       | Result                          |
|------------------------------------------------------------------------------------------------|---------------------------------|
| `GET /api/`                                                                                    | 200 — returns the React SPA     |
| `GET /api?module=stats&action=ethsupply`                                                       | 200 — returns the React SPA     |
| `GET /api/v1/stats`                                                                            | 200 — returns the React SPA     |
| `GET /api/v2/stats`                                                                            | 200 — returns the React SPA     |
| `GET /api/v2/smart-contracts/<address>`                                                        | 200 — returns the React SPA     |

`forge verify-contract … --verifier blockscout --verifier-url …` therefore
cannot be made to work against this host. Use the manual flow below.

### Manual verification (the only working path right now)

1. Open `https://chainscan-galileo.0g.ai/address/<address>` in a browser.
2. Click the **Contract** tab → **Verify & Publish**.
3. Compiler: `v0.8.24+commit.e11b9ed9`. Optimization: `Yes`, runs `200`. License: `Apache-2.0`.
4. Paste the contents of `src/PaymentReceipt.sol` (it has no imports).
5. Submit; copy the resulting verified URL into `deployments/0g-testnet.json`
   under `contracts.paymentReceipt.verifiedUrl`.

### If a programmatic API ships later

When 0G Labs exposes a Blockscout verify endpoint (likely `/api?module=contract&action=verifysourcecode`
or a Sourcify-style multi-part POST at `/api/v2/smart-contracts/{address}/verification/via/standard-input`),
swap the manual flow for:

```bash
forge verify-contract \
  0x0005910E1ecf654e7661C7beeA31A3ddE3BD3d8F PaymentReceipt \
  --chain-id 16602 \
  --verifier blockscout \
  --verifier-url <future-api-url>
```

…and record the verified URL the same way.
