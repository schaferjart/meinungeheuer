FROM node:20-slim AS build
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Install dependencies (layer-cached)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/
RUN pnpm install --frozen-lockfile --prod=false

# Copy source and build
COPY packages/shared/ packages/shared/
COPY apps/backend/ apps/backend/
COPY tsconfig.base.json ./
RUN pnpm --filter @meinungeheuer/shared build
RUN pnpm --filter @meinungeheuer/backend build

# --- Production stage ---
FROM node:20-slim
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Copy workspace config + built artifacts
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/backend/dist apps/backend/dist

EXPOSE 3001

CMD ["node", "apps/backend/dist/index.js"]
