FROM node:20-slim AS build
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/archive/package.json apps/archive/
RUN pnpm install --frozen-lockfile

COPY apps/archive/ apps/archive/
COPY tsconfig.base.json ./
RUN pnpm --filter @meinungeheuer/archive build

FROM nginx:alpine
COPY --from=build /app/apps/archive/dist /usr/share/nginx/html
RUN printf 'server {\n  listen 80;\n  root /usr/share/nginx/html;\n  location / {\n    try_files $uri $uri/ /index.html;\n  }\n}\n' > /etc/nginx/conf.d/default.conf
EXPOSE 80
