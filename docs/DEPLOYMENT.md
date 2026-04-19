# Deployment

denkfink is a small set of Docker-friendly services plus a Pi-side printer bridge. You can deploy the cloud side anywhere that runs containers (Coolify, Railway, Fly, plain Docker on a VPS). This document gives a generic path and a Coolify-specific example.

## Overview

| Service          | Location            | Container / process              | Needs build args?          |
| ---------------- | ------------------- | -------------------------------- | -------------------------- |
| Tablet           | Cloud (or local)    | Nginx serving Vite build         | ✅ (`VITE_*` baked in)     |
| Archive          | Cloud (or local)    | Nginx serving Vite build         | ✅ (`VITE_*` baked in)     |
| Config           | Cloud (or local)    | Nginx serving Vite build         | ✅ (`VITE_*` baked in)     |
| Backend          | Cloud               | Node (Hono)                      | runtime env only           |
| Print-renderer   | Cloud               | Python (FastAPI + Uvicorn)       | runtime env only           |
| Printer bridge   | **Local** (Pi/laptop on LAN with printer) | Node (tsx) via systemd | runtime env only    |
| POS server       | **Local** (Pi next to printer) | Python + python-escpos via systemd | — |
| Supabase         | Hosted (supabase.com) or self-hosted | Managed / Docker     | — |

Everything cloud-side is stateless apart from the database (Supabase) and file storage (Supabase Storage).

---

## Generic Docker deploy (any host)

Every app has a `Dockerfile` at the repo root or under its own directory. Build args that start with `VITE_` are baked into the static bundle at build time; runtime env vars are injected at container start.

```bash
# Tablet (example)
docker build \
  --build-arg VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=eyJ... \
  --build-arg VITE_ELEVENLABS_API_KEY=sk_... \
  --build-arg VITE_ELEVENLABS_AGENT_ID=agent_... \
  --build-arg VITE_BACKEND_URL=https://api.YOUR_DOMAIN.com \
  --build-arg VITE_PRINT_RENDERER_URL=https://render.YOUR_DOMAIN.com \
  -f Dockerfile -t denkfink-tablet .

docker run --rm -p 8080:80 denkfink-tablet
```

```bash
# Backend (example)
docker build -f apps/backend/Dockerfile -t denkfink-backend .
docker run --rm -p 3001:3001 \
  -e SUPABASE_URL=https://YOUR_PROJECT.supabase.co \
  -e SUPABASE_SERVICE_ROLE_KEY=eyJ... \
  -e ELEVENLABS_AGENT_ID=agent_... \
  -e OPENROUTER_API_KEY=sk-or-... \
  -e OPENAI_API_KEY=sk-... \
  denkfink-backend
```

Print-renderer (Python) works the same way — build from `apps/print-renderer/Dockerfile`, pass env at runtime.

### Monorepo-shared workspaces

Apps that depend on `@denkfink/installation-core` (tablet, backend, archive) must be built with Docker context set to the **repo root** (not the app folder) so the workspace resolution works. The provided `Dockerfile`s already handle this.

### Docker Compose (local dev)

For local development against a real Supabase project, see [docker-compose.yml](../docker-compose.yml) at the repo root.

```bash
# .env at repo root contains all the keys; see .env.example if provided.
docker compose up
```

---

## Coolify example

[Coolify](https://coolify.io) is a convenient self-hosted PaaS. If that's your path:

### Tablet / archive / config (static)

- **Build Pack**: Dockerfile
- **Base Directory**: `/` (repo root — needed so the workspace resolves)
- **Dockerfile**: `/Dockerfile` (tablet) / `/apps/archive/Dockerfile` / `/apps/config/Dockerfile`
- **Inject Build Args**: ✅ enabled
- **Build Args** (the full `VITE_*` set — Coolify reads these from the app's env vars)

### Backend / print-renderer (runtime)

- **Build Pack**: Dockerfile
- **Base Directory**: `/` (backend depends on `@denkfink/installation-core`) or `/apps/print-renderer` (self-contained Python)
- **Dockerfile**: `/apps/backend/Dockerfile` / `/apps/print-renderer/Dockerfile`
- **Inject Build Args**: ❌ disabled (these read env at runtime only)
- **Environment variables**: set the `SUPABASE_*`, `OPENROUTER_API_KEY`, etc.

### Supabase

You can point the whole stack at a managed Supabase project (easiest) or self-host Supabase via its Docker Compose. All the code cares about is a URL + anon key + service-role key.

Apply schema migrations via the Supabase CLI (`supabase db push`) or paste the SQL files in `supabase/migrations/` into the SQL editor in order.

---

## DNS + TLS

A typical production setup uses three subdomains:

| Subdomain      | Points to     | Example                       |
| -------------- | ------------- | ----------------------------- |
| `<tablet>.*`   | tablet app    | `tablet.YOUR_DOMAIN.com`      |
| `api.*`        | backend       | `api.YOUR_DOMAIN.com`         |
| `render.*`     | print-renderer| `render.YOUR_DOMAIN.com`      |
| `archive.*`    | archive app   | `archive.YOUR_DOMAIN.com`     |
| `config.*`     | config app    | `config.YOUR_DOMAIN.com`      |

If you're using Coolify / a reverse-proxy-with-automatic-TLS, plug each service into its subdomain and you're done. Otherwise: Caddy or Traefik in front of the containers is the usual story.

---

## Printer bridge (local)

The printer bridge runs next to the thermal printer, **not in the cloud**. It subscribes to Supabase Realtime for new rows in `print_queue`, fetches the rendered PNG from Supabase Storage, and streams ESC/POS to the printer over the LAN.

See [PI_SETUP.md](PI_SETUP.md) for the full Raspberry-Pi walkthrough.

---

## Operational checklist

Before opening the installation:

- [ ] Tablet loads and shows welcome screen.
- [ ] Face-wake (if using): tablet reacts to face detection (3 s debounce).
- [ ] `save_definition` client tool is registered on the ElevenLabs agent and fires at the end of a conversation.
- [ ] A fresh row appears in `definitions` and `print_queue` after a completed session.
- [ ] Printer bridge systemd unit is active (`systemctl is-active printer-bridge`).
- [ ] POS server is reachable over LAN (`curl http://<POS_IP>:9100/health`).
- [ ] Printing a known-good card end-to-end works (no dropped rows, legible output).
- [ ] Daily: paper loaded, printer head clean, tablet on mains power.

## Troubleshooting

- **`/api/config` returns error → tablet falls back to defaults (no text).** The AI will have no text context. Check backend logs + `installation_config` row.
- **`persistPrintJob` / `persistDefinition` look silent but nothing shows in Supabase.** Those writes are fire-and-forget; check Supabase directly rather than trusting the absence of a log. RLS failures are silent from the browser.
- **Tablet prints but nothing appears on paper.** Is (1) the bridge running? (2) is the POS server up? (3) is there a `pending` row in `print_queue`? If yes + yes + yes, check the bridge logs.
- **AI quotes something strange back to visitors.** Any prose in the system prompt is quotable. Write instructions as imperatives, never descriptions, in `packages/installation-core/src/programs/`.
