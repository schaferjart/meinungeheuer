FROM node:20-slim AS build
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Accept VITE_* env vars as build args (Coolify passes these automatically)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_ELEVENLABS_API_KEY
ARG VITE_ELEVENLABS_AGENT_ID
ARG VITE_ELEVENLABS_VOICE_ID
ARG VITE_BACKEND_URL
ARG VITE_PRINT_RENDERER
ARG VITE_RENDER_API_KEY

# Make them available to the Vite build
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_ELEVENLABS_API_KEY=$VITE_ELEVENLABS_API_KEY
ENV VITE_ELEVENLABS_AGENT_ID=$VITE_ELEVENLABS_AGENT_ID
ENV VITE_ELEVENLABS_VOICE_ID=$VITE_ELEVENLABS_VOICE_ID
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL
ENV VITE_PRINT_RENDERER=$VITE_PRINT_RENDERER
ENV VITE_RENDER_API_KEY=$VITE_RENDER_API_KEY

# Install dependencies (layer-cached)
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/installation-core/package.json packages/installation-core/
COPY packages/karaoke-reader/package.json packages/karaoke-reader/
COPY apps/tablet/package.json apps/tablet/
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY packages/installation-core/ packages/installation-core/
COPY packages/karaoke-reader/ packages/karaoke-reader/
COPY apps/tablet/ apps/tablet/
COPY tsconfig.base.json ./
RUN pnpm --filter @denkfink/installation-core build
RUN pnpm --filter karaoke-reader build
RUN pnpm --filter @denkfink/tablet build

FROM nginx:alpine
COPY --from=build /app/apps/tablet/dist /usr/share/nginx/html
# SPA fallback: serve index.html for all routes
RUN printf 'server {\n  listen 80;\n  root /usr/share/nginx/html;\n  location / {\n    try_files $uri $uri/ /index.html;\n  }\n}\n' > /etc/nginx/conf.d/default.conf
EXPOSE 80
