/**
 * Printer bridge configuration.
 *
 * Loaded from environment variables; sensible defaults are provided so the
 * service starts in 'console' mode (log-only, no physical printer) without
 * any configuration at all.
 */

export interface PrinterConfig {
  /** How to reach the printer. 'console' prints to stdout only (for dev/test). */
  connection: 'usb' | 'network' | 'console';
  /** For 'network': printer hostname or IP. */
  host?: string;
  /** For 'network': TCP port (default 9100). */
  port?: number;
  /** For 'usb': USB vendor ID (hex string like "0x04b8" or decimal). */
  vendorId?: number;
  /** For 'usb': USB product ID. */
  productId?: number;
  /** Number of characters per line (48 for 80 mm paper, 32 for 58 mm). */
  maxWidthChars: number;
  /** Physical paper width in mm. */
  maxWidthMm: number;
  /**
   * Charset hint. If the printer hardware does not natively support UTF-8
   * the layout engine will apply transliteration (ä→ae, etc.).
   */
  charset: string;
  /** Whether to send an auto-cut command at the end of every card. */
  autoCut: boolean;
}

function parseIntEnv(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  return Number.isNaN(value) ? fallback : Math.trunc(value);
}

function parseBoolEnv(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  return raw.toLowerCase() !== 'false' && raw !== '0';
}

function parseConnectionEnv(): PrinterConfig['connection'] {
  const raw = (process.env['PRINTER_CONNECTION'] ?? '').toLowerCase();
  if (raw === 'usb' || raw === 'network' || raw === 'console') return raw;
  return 'console'; // safe default: never crash if misconfigured
}

export function loadConfig(): PrinterConfig {
  const connection = parseConnectionEnv();

  const config: PrinterConfig = {
    connection,
    maxWidthChars: parseIntEnv('PRINTER_MAX_WIDTH_CHARS', 48),
    maxWidthMm: parseIntEnv('PRINTER_MAX_WIDTH_MM', 72),
    charset: process.env['PRINTER_CHARSET'] ?? 'UTF-8',
    autoCut: parseBoolEnv('PRINTER_AUTO_CUT', true),
  };

  if (connection === 'network') {
    config.host = process.env['PRINTER_HOST'] ?? '192.168.1.100';
    config.port = parseIntEnv('PRINTER_PORT', 9100);
  }

  if (connection === 'usb') {
    const vendorRaw = process.env['PRINTER_VENDOR_ID'];
    const productRaw = process.env['PRINTER_PRODUCT_ID'];
    if (vendorRaw) {
      config.vendorId = parseInt(vendorRaw, vendorRaw.startsWith('0x') ? 16 : 10);
    }
    if (productRaw) {
      config.productId = parseInt(productRaw, productRaw.startsWith('0x') ? 16 : 10);
    }
  }

  return config;
}
