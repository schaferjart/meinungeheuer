/**
 * Detect whether the app is running in PWA standalone mode
 * (added to Home Screen on iOS or installed as PWA on other platforms).
 *
 * In standalone mode, the browser chrome is already hidden and the
 * Fullscreen API is unavailable / unnecessary.
 */
export function isStandaloneMode(): boolean {
  // iOS Safari proprietary property (set when launched from Home Screen)
  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) {
    return true;
  }

  // Standard detection via display-mode media query (Chrome, Edge, Firefox)
  if (
    typeof window !== 'undefined' &&
    window.matchMedia('(display-mode: standalone)').matches
  ) {
    return true;
  }

  return false;
}

/**
 * Request fullscreen on the document element.
 *
 * In PWA standalone mode, this is a no-op — the app already fills the
 * screen and the Fullscreen API may not be available.
 *
 * In regular browser mode, requests fullscreen via the standard API
 * with a webkit fallback for older Safari versions.
 * Silently fails if the API is unavailable or blocked.
 */
export function requestFullscreen(): void {
  if (isStandaloneMode()) {
    return;
  }

  const el = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void>;
  };

  if (el.requestFullscreen) {
    el.requestFullscreen().catch(() => {});
  } else if (el.webkitRequestFullscreen) {
    el.webkitRequestFullscreen().catch(() => {});
  }
}
