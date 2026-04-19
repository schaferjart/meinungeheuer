FROM node:20-slim AS build
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Accept VITE_* env vars as build args
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

# Copy all package.json files for install (pnpm needs workspace structure)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/installation-core/package.json packages/installation-core/
COPY packages/karaoke-reader/package.json packages/karaoke-reader/
COPY apps/config/package.json apps/config/
COPY apps/tablet/package.json apps/tablet/
COPY apps/backend/package.json apps/backend/
COPY apps/printer-bridge/package.json apps/printer-bridge/
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY apps/config/ apps/config/
COPY tsconfig.base.json ./
RUN pnpm --filter @denkfink/config build

# Serve with nginx
FROM nginx:alpine
COPY --from=build /app/apps/config/dist /usr/share/nginx/html
COPY apps/config/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
