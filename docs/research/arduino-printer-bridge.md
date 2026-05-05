# Replacing the Pi printer-side with an Arduino

**Status:** research / feasibility — no code yet
**Branch:** `research/arduino`
**Date:** 2026-04-19

## What's being considered

Today the printer-side hardware is a Raspberry Pi running two long-lived services:

- **`apps/printer-bridge/`** — Node 20 + TS, ~491 LOC. Subscribes to Supabase Realtime on the `print_queue` table, fetches the rendered PNG from Supabase Storage, POSTs it to the local POS server.
- **`apps/pos-server/`** — Python 3.11 + Flask + `python-escpos` + Pillow, ~414 LOC. Receives PNG over HTTP, drives the Epson TM-T-series thermal printer over USB.

The user wants to know whether an Arduino could do that job instead.

> **TL;DR** — Yes, plausibly, with two big caveats:
> 1. "Arduino" has to mean an **ESP32-S3-class board** (or similar Arduino-compatible MCU with WiFi + ≥320 KB SRAM). A classic Uno is hopeless — no networking, not enough RAM for TLS handshakes or PNG decode.
> 2. The cleanest path **drops USB entirely** and runs the printer in network mode (ESC/POS over TCP port 9100) if the printer supports it. The current Epson TM-T probably does. If it has to stay on USB, the project gets significantly harder.

---

## What the Arduino actually has to do

Walking through the existing flow and stripping out anything specific to "this is a Raspberry Pi running TypeScript":

| Step | Today (Pi) | Arduino equivalent |
|------|------------|---------------------|
| 1. Subscribe to `print_queue` for new `pending` rows | `@supabase/supabase-js` Realtime channel (Phoenix-protocol WS) | Open a WSS socket to `wss://<project>.supabase.co/realtime/v1/websocket?apikey=…&vsn=1.0.0`, send `phx_join` for the right topic |
| 2. Fetch the rendered PNG | HTTPS GET on Supabase Storage public URL | HTTPS GET (TLS) — or, easier, use `print-renderer`'s own URL since it already returns raster bytes |
| 3. Decode PNG → raster bitmap | Pillow (server-side rendering already produced it) | `PNGdec` library, line-by-line decode in ~48 KB working RAM |
| 4. Encode as ESC/POS raster (`GS v 0`) | `python-escpos` does it | Hand-written: `0x1D 0x76 0x30 0x00 wL wH hL hH <bytes>` per band |
| 5. Push bytes to printer | USB (`pyusb` → bulk-out endpoint) | TCP socket *or* USB-OTG host, see options below |
| 6. Acknowledge / mark row `done` in Supabase | REST `PATCH` with service-role key | Same pattern, smaller HTTP client |

There is also a **fallback render path**: if the cloud `print-renderer` is unreachable, the bridge falls back to letting the local POS server render the card from a JSON payload. On Arduino we'd skip that fallback entirely — not feasible to port `Pillow` + Jinja templating to an MCU. The cloud renderer becomes mandatory.

---

## Three architectural options

### Option A — Network printer (TCP/9100), plain ESP32

**Complexity:** lowest
**Hardware cost:** ~$10 (ESP32-DevKitC) + whatever your printer already is
**Feasibility:** very high

Many Epson TM-T-series printers ship with an Ethernet or WiFi interface board (UB-E or UB-WL). The printer binds port 9100 and accepts raw ESC/POS bytes — same protocol, different transport.

If your printer supports it, the Arduino's only job is:

```c++
WiFiClientSecure supa;       // for Supabase WSS + HTTPS
WiFiClient printer;          // plain TCP to 192.168.x.y:9100

// 1. join Realtime channel
// 2. on INSERT event:
//    a. HTTPS GET the rendered PNG from Storage (or print-renderer)
//    b. PNG decode line-by-line via PNGdec
//    c. for each band, write GS v 0 + dot bytes to `printer`
//    d. PATCH the queue row to `done`
```

Skips the entire USB question. Skips the entire `pos-server` Python service. The Arduino *replaces* both `printer-bridge` and `pos-server` in one ~500 LOC firmware.

**What you give up:** the printer must be on the same LAN as the ESP32. If you currently use a USB-only printer, you'd have to swap the interface board (Epson sells USB-and-Ethernet variants for most TM-T models) or buy a different printer.

---

### Option B — USB-host on ESP32-S3 (or ESP32-S2)

**Complexity:** high
**Hardware cost:** ~$15 (ESP32-S3-DevKitC-1) + a USB-A breakout
**Feasibility:** medium — proof-of-concepts exist but not turnkey

ESP32-S3 has native USB-OTG host capability. The IDF ships `usb_host.h`; community demos exist (`touchgadget/esp32-usb-host-demos`) for printers, MIDI, and HID. M5Stack also sells a "USB Module" with a MAX3421E chip that adds USB host to any ESP32 board, with an existing ESC/POS thermal-printer demo.

But: there is **no plug-and-play "USB ESC/POS for Arduino" library** in the same way `python-escpos` exists. You'd be writing the USB descriptor parsing, the bulk-out endpoint discovery, the `/dev/usb/lp0`-equivalent transport yourself — perhaps 200–400 LOC of careful USB-IDF code on top of the application logic.

Reasonable if your printer is hard-wired to USB and can't change, and you want to keep the same physical setup. Otherwise Option A is cheaper, simpler, and more reliable.

---

### Option C — Different printer (TTL-serial), classic Arduino-friendly path

**Complexity:** lowest if you accept a printer swap
**Hardware cost:** ~$50 for an Adafruit Mini Thermal Printer or CSN-A2-clone, ~$5 for the MCU
**Feasibility:** very high, lots of existing libraries

Most Arduino+thermal-printer tutorials in the wild use 5 V TTL-serial thermal printers (Adafruit "Mini Thermal Receipt Printer", CSN-A2, EM5820). These speak ESC/POS over a UART at 9600–115200 baud. Adafruit ships a maintained Arduino library; `gdsports/ESC_POS_Printer` and `cranties/escposprinter` are alternatives.

The catch: these are **58 mm-wide printers, not 80 mm**. The current installation prints at 576 dot width (80 mm); the Adafruit-style serial printers are 384 dot width (58 mm). Card layouts in `apps/print-renderer/templates.py` would need adjusting. That's a creative-direction change as much as an engineering one.

If you're willing to go to 58 mm receipts, this is the easiest hardware path: classic Arduino + serial printer + WiFi shield (or ESP32 + serial printer). Lots of community examples.

---

## Library landscape

| Need | Library | Notes |
|------|---------|-------|
| Supabase Realtime | [`jhagas/ESPSupabase`](https://github.com/jhagas/ESPSupabase) | REST + Realtime, ESP32/8266, in Arduino Lib Manager |
| Supabase Realtime (alt) | [`zumatt/Supabase-Arduino`](https://github.com/zumatt/Supabase-Arduino) | API-key auth, ESP32/RP2040 |
| WebSocket fallback | `ArduinoWebsockets`, `links2004/WebSockets` | If you want raw control over the Phoenix protocol |
| HTTPS / TLS | `WiFiClientSecure` (ESP32 built-in, mbedTLS) | Bring your own root CA bundle for `*.supabase.co` |
| PNG decode | [`bitbank2/PNGdec`](https://github.com/bitbank2/PNGdec) | Larry Bank's library, ~48 KB RAM, line-callback API |
| ESC/POS commands | [`gdsports/ESC_POS_Printer`](https://github.com/gdsports/ESC_POS_Printer) | High-level commands, written for serial; raster command is small enough to inline |
| USB host (Option B) | `usb_host.h` (ESP-IDF), `touchgadget/esp32-usb-host-demos` | Manual descriptor handling |

---

## Cost / complexity comparison

| Path | Hardware | Firmware LOC (est.) | Realistic time-to-first-print | Long-term maintenance |
|------|----------|---------------------|-------------------------------|------------------------|
| **A. Net printer + ESP32** | $10 board + (existing printer w/ Ethernet card OR ~$50 to add one) | ~500 | 1–2 days | Low — single firmware, OTA updates |
| **B. USB-host ESP32-S3** | ~$15 board, keep existing USB printer | ~800–1000 | 1–2 weeks | Medium — USB stack edge cases |
| **C. Serial printer + ESP32** | ~$50 new printer + ~$5 MCU | ~300 | 1 day | Low — fewest moving parts |
| Pi (today) | ~$80 Pi 5 + USB printer | 905 (existing) | working today | High — two services, two languages, OS updates |

---

## Risks & open questions

1. **TLS on ESP32 has a real RAM cost.** A WSS handshake to Supabase needs the whole certificate chain in RAM at once. ESP32-S3 with PSRAM handles it; bare ESP32 with 320 KB SRAM is borderline.
2. **Supabase Realtime auth token rotation.** The community libs use an anon key, but our printer-bridge today uses `SUPABASE_SERVICE_ROLE_KEY`. Embedding a service-role key in firmware is a security smell — anyone with physical access to the board can extract it. We'd want either: (a) a dedicated, narrow-scope key with RLS that only allows reading `print_queue` and updating `status`, or (b) a JWT-rotating mini-proxy in the cloud the Arduino calls.
3. **No fallback path** if the cloud renderer is down. The Pi's `pos-server` can render a card from raw text if the renderer is unreachable; the Arduino can't. We need to decide whether that's acceptable or whether we add a different fallback (eg. a "service unavailable" pre-rendered PNG burned into flash).
4. **OTA updates and observability.** Today you `git pull` on the Pi and `systemctl restart`. With an Arduino you'd want `ArduinoOTA` configured + some way to see error logs (Serial monitor + `/cleanup/run`-style HTTP endpoint exposing recent log lines).
5. **Physical hardening.** A bare dev board with dangling jumpers is not exhibition-grade. You'd want at minimum a printed enclosure, screw terminals, and a power supply that survives the printer's spike when it kicks the heater.

---

## Recommendation

**Build Option A first as a proof-of-concept.**

Reasoning:
- Lowest risk — you can buy a $10 ESP32 board this afternoon and have a "subscribe to Supabase, print a hard-coded ESC/POS hello-world" running by tomorrow.
- It exercises the two hardest pieces (Realtime WS + TLS) without committing you to USB.
- If your current Epson model has a USB-and-Ethernet variant, the printer swap is a $40 interface board, not a new printer.
- If the Realtime + TLS + ESC/POS-encoding pieces work on the ESP32, **Option B becomes a small additional step** — same firmware minus the TCP socket, plus a USB-host driver. You haven't wasted work.
- If they don't work cleanly (eg. WSS keeps disconnecting under exhibition-grade WiFi), you've learned that cheap and can fall back to keeping the Pi.

A reasonable proof-of-concept milestone:

1. ESP32 connects to WiFi.
2. ESP32 connects to Supabase Realtime, joins the `print_queue:*` channel.
3. Insert a row manually via Supabase SQL editor; ESP32 logs the event over Serial.
4. ESP32 fetches the rendered PNG from Storage.
5. ESP32 decodes line-by-line and writes to a fake "printer" (TCP echo server on a laptop).
6. Swap the fake server for the real network printer.

Until step 5 prints recognisable bytes, none of the rest matters. Until step 6 prints recognisable receipts, it's still not done.

---

## Sources

- [`gdsports/ESC_POS_Printer`](https://github.com/gdsports/ESC_POS_Printer) — Arduino ESC/POS printer library (UART-focused)
- [`touchgadget/esp32-usb-host-demos`](https://github.com/touchgadget/esp32-usb-host-demos) — ESP32-S2 USB-host printer/MIDI/keyboard demos
- [`jhagas/ESPSupabase`](https://github.com/jhagas/ESPSupabase) — Supabase Realtime + REST for ESP32/8266
- [`zumatt/Supabase-Arduino`](https://github.com/zumatt/Supabase-Arduino) — Supabase Realtime DB for ESP32/RP2040
- [`bitbank2/PNGdec`](https://github.com/bitbank2/PNGdec) — Larry Bank's embedded-friendly PNG decoder (~48 KB RAM)
- [Hackaday — PNG image decoding library does it with minimal RAM](https://hackaday.com/2021/07/17/png-image-decoding-library-does-it-with-minimal-ram/)
- [Circuit Digest — ESP32 Thermal Printer Tutorial: Interface PNP-500 Receipt Printer](https://circuitdigest.com/microcontroller-projects/how-to-interface-thermal-printer-with-esp32)
- [Circuit Splash — Interfacing ESP32 with Thermal Printer using UART ESC/POS](https://www.circuitsplash.com/interfacing-esp32-with-thermal-printer-using-uart-escpos)
- [Supabase Docs — Realtime Protocol](https://supabase.com/docs/guides/realtime/protocol)
- [`hrbrmstr/escpos`](https://github.com/hrbrmstr/escpos) — R package showing TCP/9100 ESC/POS pattern
