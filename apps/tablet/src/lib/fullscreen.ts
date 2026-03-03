/**
 * Request fullscreen on the document element.
 *
 * Silently swallows errors — fullscreen may be blocked by the browser
 * if not triggered by a user gesture, or if the API is unavailable
 * (e.g. some iOS WebViews). This is fine: the installation will still
 * work, it just won't hide browser chrome.
 */
export function requestFullscreen(): void {
  const el = document.documentElement;

  // Standard API
  if (el.requestFullscreen) {
    el.requestFullscreen().catch(() => {});
    return;
  }

  // WebKit (older Safari / iOS)
  const webkit = el as unknown as { webkitRequestFullscreen?: () => void };
  if (webkit.webkitRequestFullscreen) {
    webkit.webkitRequestFullscreen();
  }
}
