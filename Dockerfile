# Empire Reborn — Production Dockerfile
# Single container: builds client, runs server serving static files + WebSocket + API

FROM node:22-slim AS base
RUN corepack enable pnpm

WORKDIR /app

# ─── Install dependencies ────────────────────────────────────────────────────

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/client/package.json packages/client/
COPY packages/server/package.json packages/server/

RUN pnpm install --frozen-lockfile

# ─── Copy source ─────────────────────────────────────────────────────────────

COPY tsconfig.base.json ./
COPY packages/shared/ packages/shared/
COPY packages/client/ packages/client/
COPY packages/server/ packages/server/

# ─── Build client ────────────────────────────────────────────────────────────

RUN pnpm --filter @empire/client build

# ─── Runtime ─────────────────────────────────────────────────────────────────

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

# Data directory for SQLite persistence
VOLUME /app/data

CMD ["pnpm", "--filter", "@empire/server", "start"]
