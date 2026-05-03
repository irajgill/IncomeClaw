# IncomeClaw — contracts

Foundry project. One contract this phase: [`PaymentReceipt`](src/PaymentReceipt.sol) (lands in A4).

## Layout

- `src/` — Solidity 0.8.24 sources
- `test/` — Foundry tests (`forge test -vvv`)
- `script/` — deploy scripts (`forge script`)
- `lib/` — vendored deps: `forge-std`, `openzeppelin-contracts@v5.1.0`

## Common commands

```bash
forge build
forge test -vvv
forge snapshot                 # gas snapshot to .gas-snapshot
forge fmt                      # format
forge script script/Deploy.s.sol --rpc-url $RPC_URL --private-key $PRIVATE_KEY --broadcast
```

## Verification on 0G chainscan

The 0G Galileo explorer at `chainscan-galileo.0g.ai` is Blockscout-flavored.
Try the standard Foundry verify route first; the manual fallback is documented
after A4 deploy is run.
