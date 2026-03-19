# Raspberry Pi Setup — MeinUngeheuer POS Server

## Prerequisites

- Raspberry Pi (aarch64, tested on Pi 5 with Bookworm)
- Thermal printer connected via USB (NXP/Epson TM series)
- WiFi configured via cloud-init or NetworkManager
- SD card: user `skander`, hostname `rasberrypi`

## 1. Clone the Repository

```bash
cd ~
git clone https://github.com/schaferjart/meinungeheuer.git
```

## 2. Install System Dependencies

```bash
sudo apt update
sudo apt install -y libusb-1.0-0-dev
```

## 3. Install Python Dependencies

```bash
pip install \
  flask \
  flask-cors \
  python-escpos \
  pyusb \
  zeroconf \
  requests \
  pyyaml \
  numpy \
  --break-system-packages
```

**Note:** `mediapipe` does NOT have an aarch64 wheel — it only supports x86.
The portrait pipeline will fall back to center-crops (no face-aware cropping).
Pillow ships pre-installed on Raspberry Pi OS.

## 4. USB Printer Permissions

By default, USB printers require root. To allow the `skander` user to access the printer:

```bash
# Find the printer's vendor and product ID
lsusb | grep -i print
# Example output: Bus 001 Device 002: ID 1fc9:2016 NXP Semiconductors USB Printer P

# Create a udev rule (replace 1fc9 and 2016 with your IDs)
sudo tee /etc/udev/rules.d/99-thermal-printer.rules <<'EOF'
SUBSYSTEM=="usb", ATTR{idVendor}=="1fc9", ATTR{idProduct}=="2016", MODE="0666", GROUP="plugdev"
EOF

sudo udevadm control --reload-rules
sudo udevadm trigger
```

## 5. Start the POS Server

```bash
cd ~/meinungeheuer/apps/pos-server
python3 print_server.py
```

With options:
```bash
# Dummy mode (no printer needed)
python3 print_server.py --dummy

# Save portrait pipeline intermediates
python3 print_server.py --save-dir test_output

# Skip AI style transfer
python3 print_server.py --skip-transform
```

Server starts on `http://0.0.0.0:9100`.

## 6. Verify

From another machine on the same network:

```bash
# Health check
curl http://rasberrypi.local:9100/health

# Test print
curl -X POST http://rasberrypi.local:9100/print/dictionary \
  -H "Content-Type: application/json" \
  -d '{
    "word": "Ungeheuer",
    "definition": "That which is not quite at home in the world.",
    "citations": ["Was ist das Ungeheure?"]
  }'
```

## 7. Auto-Start on Boot (Optional)

```bash
# Create systemd service
sudo tee /etc/systemd/system/pos-server.service <<'EOF'
[Unit]
Description=MeinUngeheuer POS Thermal Printer Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=skander
WorkingDirectory=/home/skander/meinungeheuer/apps/pos-server
ExecStart=/usr/bin/python3 print_server.py
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable pos-server
sudo systemctl start pos-server

# Check status
sudo systemctl status pos-server
```

## Network Notes

- Pi gets IP via DHCP — use `rasberrypi.local` (mDNS) instead of hardcoded IPs
- Hostname has a typo (`rasberrypi` not `raspberrypi`) — set in cloud-init, kept for consistency
- Home WiFi: `SFR_25D0` (France)
- Hotspot: `yunes`
- ETH eduroam: not working (see GitHub issue #3)

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `No module named 'escpos'` | `pip install python-escpos --break-system-packages` |
| `No module named 'flask_cors'` | `pip install flask-cors --break-system-packages` |
| `No module named 'zeroconf'` | `pip install zeroconf --break-system-packages` |
| USB permission denied | See step 4 (udev rules) |
| `mediapipe` won't install | Expected on ARM — pipeline uses center-crop fallback |
| Pi not found on network | `ping rasberrypi.local` or scan with `arp -a` |
| Password forgotten | Mount SD card, edit `/boot/firmware/user-data`, change instance-id in `meta-data` |
