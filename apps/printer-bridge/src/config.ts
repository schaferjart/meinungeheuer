/**
 * Printer bridge configuration.
 *
 * Simplified: the only printer-related setting is the POS server URL.
 * An empty value or "console" means log-only mode (no HTTP calls).
 */

export interface BridgeConfig {
  posServerUrl: string;
  printRendererUrl: string;
  renderApiKey: string;
}

export function loadConfig(): BridgeConfig {
  return {
    posServerUrl: process.env['POS_SERVER_URL'] ?? 'http://localhost:9100',
    printRendererUrl: process.env['PRINT_RENDERER_URL'] ?? 'http://localhost:8000',
    renderApiKey: process.env['RENDER_API_KEY'] ?? '',
  };
}
