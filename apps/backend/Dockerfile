FROM node:20-slim AS build
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Install dependencies (layer-cached)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/installation-core/package.json packages/installation-core/
COPY apps/backend/package.json apps/backend/
RUN pnpm install --frozen-lockfile --prod=false

# Copy source and build
COPY packages/installation-core/ packages/installation-core/
COPY apps/backend/ apps/backend/
COPY tsconfig.base.json ./
RUN pnpm --filter @denkfink/installation-core build
RUN pnpm --filter @denkfink/backend build

# --- Production stage ---
FROM node:20-slim
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Copy workspace config + built artifacts
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/installation-core/package.json packages/installation-core/
COPY apps/backend/package.json apps/backend/
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/packages/installation-core/dist packages/installation-core/dist
COPY --from=build /app/apps/backend/dist apps/backend/dist

EXPOSE 3001

CMD ["node", "apps/backend/dist/index.js"]
