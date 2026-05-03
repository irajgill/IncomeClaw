# No internal-reach

This is **working agreement #1** in `IncomeClaw-Roadmap.md` §13 and is enforced
by ESLint at the repo root.

## The rule

Every import from a `@sovereignclaw/*` package must use the package's **public
entry point** — the bare package specifier — and nothing else. Any path-suffixed
import (`@sovereignclaw/core/dist/...`, `@sovereignclaw/memory/src/...`,
`@sovereignclaw/inft/internal/...`) is a **lint error**, not a warning.

```ts
// ✅ allowed
import { Agent, sealed0GInference } from '@sovereignclaw/core';
import { OG_Log, encrypted } from '@sovereignclaw/memory';

// ❌ forbidden — `pnpm lint` will exit non-zero
import { Agent } from '@sovereignclaw/core/dist/agent.js';
import { OG_Log } from '@sovereignclaw/memory/src/og-log.js';
import { reencryptInternal } from '@sovereignclaw/inft/internal/oracle-client.js';
```

## Why

If IncomeClaw needs an API that `@sovereignclaw/*` doesn't expose, the answer
is **always**: ship the API in SovereignClaw first, publish, bump the dep, then
use it. Reaching into internals couples IncomeClaw to private framework
structure that can change without notice and makes the framework no longer the
contract — which defeats the entire framework-track submission.

The reverse case is also covered by `eslint-plugin-boundaries` configured at
the repo root: agent code in `agents/` cannot import the orchestrator's HTTP
routes, the web app cannot import `agents/`, and so on. The full mapping is
in `eslint.config.js` under `boundaries/element-types`.

## Living example of a violation

[`examples/lint-violations/internal-reach.ts.disabled`](../examples/lint-violations/internal-reach.ts.disabled)
contains lines that *would* trip the lint rule if the file were renamed to
`.ts` and removed from the `ignores` glob. It's there as documentation, not
code — never enable it.

## Verifying the rule is live

From the repo root:

```bash
# Sanity: clean lint run.
pnpm lint                                # exits 0

# Temporarily move the example into the lint scope and confirm it fails:
mv examples/lint-violations/internal-reach.ts.disabled \
   agents/src/__internal-reach-test.ts
pnpm lint                                # exits 1, prints no-restricted-imports errors
mv agents/src/__internal-reach-test.ts \
   examples/lint-violations/internal-reach.ts.disabled
```
