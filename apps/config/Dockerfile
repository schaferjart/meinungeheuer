FROM node:20-slim AS build
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Accept VITE_* env vars as build args
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

# Install dependencies
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/config/package.json apps/config/
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY apps/config/ apps/config/
COPY tsconfig.base.json ./
RUN pnpm --filter @meinungeheuer/config build

# Serve with nginx
FROM nginx:alpine
COPY --from=build /app/apps/config/dist /usr/share/nginx/html
COPY apps/config/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
