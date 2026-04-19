# Raspberry Pi Setup — denkfink POS server + printer bridge

This walks through bringing up a Raspberry Pi next to the thermal printer. The Pi runs two long-lived services:

- **`pos-server`** — a tiny Python HTTP server that accepts rendered PNG images and streams them to the printer over USB (ESC/POS).
- **`printer-bridge`** — a Node service that subscribes to Supabase Realtime and forwards new rows from `print_queue` to the POS server.

Everything else (tablet, backend, print-renderer) lives in the cloud and does not run on the Pi.

## Prerequisites

- Raspberry Pi (aarch64; tested on Pi 5 with Raspberry Pi OS "Bookworm")
- Thermal printer connected via USB (Epson TM-T series and compatibles)
- WiFi or Ethernet reachable from wherever the tablet and cloud live
- Fresh SD card with Raspberry Pi OS and SSH enabled

Throughout this guide `pi` is used as the system username and `/home/pi/denkfink` as the checkout path. Substitute your own if you chose different values at OS-install time — remember to update the paths inside `pos-server.service` and `printer-bridge.service` to match.

## 1. Clone the repo

```bash
sudo apt update && sudo apt install -y git python3-pip python3-venv nodejs npm
cd ~
git clone https://github.com/YOUR_ORG/denkfink.git
cd denkfink
```

> **RAM note:** the Pi's RAM is limited. `pnpm install` across the whole monorepo can OOM-kill. For the Pi we only need the printer-bridge and its shared package, and we install with `--ignore-scripts`. We also commit `packages/installation-core/dist/` so the Pi never has to build it.

```bash
# Install only what the printer bridge needs
cd /home/pi/denkfink
corepack enable
corepack prepare pnpm@latest --activate
pnpm install --filter @denkfink/printer-bridge... --ignore-scripts
```

## 2. POS server (Python ESC/POS bridge)

```bash
cd /home/pi/denkfink/apps/pos-server
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
deactivate
```

### Allow the `pi` user to access the USB printer

By default USB printers require root. Add the user to the `lp` group and grant udev permissions:

```bash
sudo usermod -aG lp pi
echo 'SUBSYSTEM=="usb", ATTRS{idVendor}=="04b8", MODE="0660", GROUP="lp"' | \
  sudo tee /etc/udev/rules.d/99-escpos.rules
sudo udevadm control --reload-rules
sudo udevadm trigger
# log out + in, or reboot, so the group change takes effect
```

(`04b8` is the Epson vendor ID. Adjust for your printer — `lsusb` shows it.)

Test:

```bash
cd /home/pi/denkfink/apps/pos-server
source venv/bin/activate
python3 print_server.py &
curl http://localhost:9100/health
```

You should see `{"ok": true}`.

## 3. Printer bridge (Node service)

Create `/home/pi/denkfink/apps/printer-bridge/.env` from the example in that directory. Fill in:

```
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
POS_SERVER_URL=http://localhost:9100
# If you run a print-renderer separately (recommended):
RENDER_API_KEY=...
PRINT_RENDERER_URL=https://render.YOUR_DOMAIN.com
```

Smoke test:

```bash
cd /home/pi/denkfink/apps/printer-bridge
pnpm dev
# In another shell, insert a test row into print_queue via the Supabase SQL editor
# and watch the bridge pick it up + print.
```

## 4. systemd units

The repo ships unit files you can copy into `/etc/systemd/system/`:

```bash
sudo cp /home/pi/denkfink/apps/pos-server/pos-server.service      /etc/systemd/system/
sudo cp /home/pi/denkfink/apps/printer-bridge/printer-bridge.service /etc/systemd/system/
```

**Before enabling**, open each file and adjust `User=` / `WorkingDirectory=` / `EnvironmentFile=` if your username or checkout path differs from the defaults (`pi` / `/home/pi/denkfink/...`).

```ini
# /etc/systemd/system/pos-server.service
[Unit]
Description=denkfink POS Thermal Printer Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/denkfink/apps/pos-server
ExecStart=/home/pi/denkfink/apps/pos-server/venv/bin/python3 print_server.py
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

(If you use a virtualenv as shown above, make sure `ExecStart` points at the venv's `python3`.)

Enable and start both:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now pos-server printer-bridge
sudo systemctl status pos-server printer-bridge
```

## 5. Updating

When you push changes to `main`:

```bash
ssh pi@<printer-pi>
cd ~/denkfink
git pull origin main
sudo systemctl restart printer-bridge pos-server
```

No build step is needed — `packages/installation-core/dist/` is committed so the Pi never builds TypeScript.

## Troubleshooting

- **Nothing prints** — check the three layers in order:
  1. `systemctl is-active printer-bridge` → should be `active`
  2. `curl http://localhost:9100/health` → should be `{"ok": true}`
  3. In Supabase, check `print_queue` — are there `pending` rows piling up?
- **Blurry or streaky prints** — the thermal head needs cooldown. The config app has a "Delay between prints" slider for slice workflows. For one-off printing, wait ~5 s between prints.
- **Printer unresponsive after many prints** — the head may be overheating. Cut power for 30 s and try again.
- **`pnpm install` OOM-killed on Pi** — use `pnpm install --filter @denkfink/printer-bridge... --ignore-scripts` to install only what the bridge needs.
