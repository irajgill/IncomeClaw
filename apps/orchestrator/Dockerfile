# IncomeClaw orchestrator — multi-stage build.
# Pinned versions match the workspace root.

# ─── Stage 1: build ──────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# Copy only what's needed to install workspace deps. Order optimized so a
# code change doesn't bust the npm-install cache layer.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/orchestrator/package.json apps/orchestrator/
COPY apps/web/package.json apps/web/
COPY agents/package.json agents/

RUN pnpm install --frozen-lockfile --filter @incomeclaw/orchestrator...

# Copy sources and build only the orchestrator + its workspace deps.
COPY tsconfig.base.json ./
COPY apps/orchestrator apps/orchestrator
COPY agents agents

RUN pnpm --filter @incomeclaw/orchestrator build

# ─── Stage 2: runtime ────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    LOG_LEVEL=info

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate \
 && groupadd --system --gid 1001 incomeclaw \
 && useradd  --system --uid 1001 --gid incomeclaw --shell /bin/false incomeclaw

# Bring over the pruned production dependency tree + the compiled output.
COPY --from=builder /repo/pnpm-workspace.yaml /repo/pnpm-lock.yaml /repo/package.json ./
COPY --from=builder /repo/apps/orchestrator/package.json ./apps/orchestrator/package.json
COPY --from=builder /repo/apps/orchestrator/dist          ./apps/orchestrator/dist
# Workspace deps the orchestrator depends on must be present too. Phase A
# scope: just `agents` (which exports typed errors + web-search). Phase D
# wires in BullMQ etc.
COPY --from=builder /repo/agents/package.json ./agents/package.json
COPY --from=builder /repo/agents/dist          ./agents/dist

RUN pnpm install --frozen-lockfile --prod --filter @incomeclaw/orchestrator...

USER incomeclaw
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/healthz').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["node", "apps/orchestrator/dist/server.js"]
