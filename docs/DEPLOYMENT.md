# MeinUngeheuer — Deployment & Operations Guide

How the installation runs in production, how to set it up from scratch, and how to monitor it remotely.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  CLOUD (Coolify on baufer-1 server)                     │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │   Tablet      │  │   Backend    │  │ Print Renderer│  │
│  │   (React SPA) │  │   (Hono API) │  │ (FastAPI)     │  │
│  │   nginx :80   │  │   :3001      │  │ :8000         │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬────────┘  │
│         │                 │                  │           │
│  fink.baufer.beauty  api.baufer.beauty  render.baufer.beauty
└─────────┼─────────────────┼──────────────────┼───────────┘
          │                 │                  │
          │          ┌──────┴──────┐           │
          └──────────┤  Supabase   ├───────────┘
                     │  (Postgres) │
                     └──────┬──────┘
                            │ polling every 5s
                     ┌──────┴──────┐
                     │   LOCAL PI  │
                     │             │
                     │  Printer    │──→ POS Server ──→ USB Printer
                     │  Bridge     │    (Flask :9100)
                     └─────────────┘
```

**Data flow for a print job:**
1. Tablet writes a definition to Supabase `print_queue` table
2. Printer Bridge (on Pi) polls every 5s, finds the pending job
3. Bridge calls Print Renderer (cloud) to render text → PNG image
4. Bridge sends the PNG to POS Server (local on Pi)
5. POS Server sends ESC/POS commands to the physical thermal printer
6. Paper comes out

---

## Services

| Service | Location | URL/Port | Auto-restarts | Dockerfile |
|---------|----------|----------|---------------|------------|
| Tablet | Coolify | `fink.baufer.beauty` | Yes (Coolify) | `/Dockerfile` |
| Backend | Coolify | `api.baufer.beauty` | Yes (Coolify) | `/apps/backend/Dockerfile` |
| Print Renderer | Coolify | `render.baufer.beauty` | Yes (Coolify) | `/apps/print-renderer/Dockerfile` |
| Printer Bridge | Raspberry Pi | N/A (background service) | Yes (systemd) | N/A |
| POS Server | Raspberry Pi | `localhost:9100` | Yes (systemd) | N/A |

---

## Cloud Setup (Coolify)

Coolify runs on the `baufer-1` server. All three cloud services are separate applications in the same Coolify project, deploying from the same GitHub repo (`schaferjart/meinungeheuer`), `main` branch.

### Tablet (existing)

| Setting | Value |
|---------|-------|
| Name | VAKUNST |
| Base Directory | `/` |
| Dockerfile Location | `/Dockerfile` |
| Branch | `main` |
| Auto Deploy | Yes |
| Inject Build Args | Yes |

**Environment variables:**
```
VITE_SUPABASE_URL=https://zkgkyvvdeotqzxdgushn.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_ELEVENLABS_API_KEY=<elevenlabs key>
VITE_ELEVENLABS_AGENT_ID=<agent id>
VITE_ELEVENLABS_VOICE_ID=<voice id>
VITE_BACKEND_URL=https://api.baufer.beauty
VITE_PRINT_RENDERER_URL=https://render.baufer.beauty
```

### Backend

| Setting | Value |
|---------|-------|
| Name | Backend |
| Base Directory | `/` |
| Dockerfile Location | `/apps/backend/Dockerfile` |
| Branch | `main` |
| Auto Deploy | Yes |
| Inject Build Args | No |

**Environment variables:**
```
PORT=3001
SUPABASE_URL=https://zkgkyvvdeotqzxdgushn.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role key>
OPENROUTER_API_KEY=<openrouter key>
WEBHOOK_SECRET=<webhook secret>
ELEVENLABS_API_KEY=<elevenlabs server key>
```

### Print Renderer

| Setting | Value |
|---------|-------|
| Name | Print Renderer |
| Base Directory | `/apps/print-renderer` |
| Dockerfile Location | `/apps/print-renderer/Dockerfile` |
| Branch | `main` |
| Auto Deploy | Yes |
| Inject Build Args | No |

**Environment variables:**
```
SUPABASE_URL=https://zkgkyvvdeotqzxdgushn.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role key>
RENDER_API_KEY=<render api key>
```

---

## Raspberry Pi Setup

### Prerequisites

- Raspberry Pi with Debian/Raspbian
- USB thermal printer connected
- Network access (WiFi or Ethernet)
- Node.js 20+ and Python 3.11+

### 1. Install Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs
sudo npm install -g pnpm
```

### 2. Clone the repo

```bash
cd ~
git clone https://github.com/schaferjart/meinungeheuer.git
cd meinungeheuer
```

### 3. Install dependencies

Full `pnpm install` may fail on Pi due to limited RAM. Use filtered install:

```bash
pnpm install --filter @meinungeheuer/printer-bridge... --prod=false --ignore-scripts
```

Build the shared package:

```bash
cd packages/shared && npx tsc && cd ../..
```

### 4. Configure the printer bridge

```bash
cp apps/printer-bridge/.env.example apps/printer-bridge/.env
nano apps/printer-bridge/.env
```

Fill in:
```
SUPABASE_URL=https://zkgkyvvdeotqzxdgushn.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role key>
POS_SERVER_URL=http://localhost:9100
PRINT_RENDERER_URL=https://render.baufer.beauty
RENDER_API_KEY=<same key as in Coolify print-renderer>
```

### 5. Install systemd services

```bash
cd ~/meinungeheuer
bash setup-pi-services.sh
```

This installs and starts both services. They auto-restart on crash and on reboot.

### 6. Verify

```bash
sudo systemctl status printer-bridge
sudo systemctl status pos-server
```

Both should show `active (running)`.

---

## Remote Access (Tailscale)

Tailscale creates a secure mesh VPN so you can SSH into the Pi from anywhere.

### Setup

Install Tailscale on the Pi:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

Authenticate via the URL it gives you. Use the same Tailscale account on your laptop.

### Usage

From your laptop, anywhere in the world:

```bash
# Check all devices
tailscale status

# SSH into the Pi
ssh skander@100.72.150.86

# Check service status
sudo systemctl status printer-bridge
sudo systemctl status pos-server

# Follow live logs
sudo journalctl -u printer-bridge -f
sudo journalctl -u pos-server -f

# Restart a service
sudo systemctl restart printer-bridge
sudo systemctl restart pos-server

# Pull and deploy new code
cd ~/meinungeheuer
git pull origin main
sudo systemctl restart printer-bridge
sudo systemctl restart pos-server
```

### Tailscale IPs (current)

| Device | IP |
|--------|-----|
| MacBook (primary) | `100.88.38.103` |
| Coolify server (baufer-1) | `100.76.51.36` |
| Raspberry Pi | `100.72.150.86` |

---

## Monitoring During Exhibition

### Quick health check

```bash
# From your laptop (via Tailscale)
ssh skander@100.72.150.86 "sudo systemctl is-active printer-bridge pos-server"
```

Should output:
```
active
active
```

### If printing stops

1. **Check bridge logs:** `sudo journalctl -u printer-bridge -n 50`
2. **Check POS logs:** `sudo journalctl -u pos-server -n 50`
3. **Check pending jobs in Supabase:** look at `print_queue` table for `pending` or `error` status
4. **Restart services:** `sudo systemctl restart printer-bridge pos-server`
5. **Check printer USB:** make sure the cable is connected, run `lsusb` to verify

### If the Pi rebooted

Services auto-start. Just verify:
```bash
sudo systemctl status printer-bridge pos-server
```

### If you pushed new code

```bash
cd ~/meinungeheuer
git pull origin main
cd packages/shared && npx tsc && cd ../..
sudo systemctl restart printer-bridge
# Only restart pos-server if its code changed:
sudo systemctl restart pos-server
```

---

## Supabase Notes

- **Realtime** is enabled but currently returns 500 (Cloudflare worker exception on free tier). The printer bridge uses **polling every 5 seconds** as a fallback. If Realtime starts working, the bridge will use both — Realtime for instant pickup, polling as backup.
- **Migrations** are NOT auto-applied. After adding a new migration file, apply it via the Supabase dashboard SQL editor or MCP tools.
- **RLS policies** allow anon read on most tables. Writes require authenticated role (config page) or service role key (backend, print-renderer).

---

## Deployment Checklist (new exhibition)

- [ ] Coolify server running with all 3 apps deployed
- [ ] Supabase project accessible, migrations applied
- [ ] Pi connected to network and USB printer
- [ ] `printer-bridge` and `pos-server` systemd services active
- [ ] Tailscale installed on Pi and your laptop
- [ ] Test print: insert a row into `print_queue` and verify paper output
- [ ] ElevenLabs agent configured with correct system prompt
- [ ] Tablet browser in kiosk mode pointing to `fink.baufer.beauty`
