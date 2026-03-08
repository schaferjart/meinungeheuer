// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('isStandaloneMode', () => {
  let originalStandalone: unknown;
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    originalStandalone = (navigator as Record<string, unknown>).standalone;
    originalMatchMedia = window.matchMedia;
  });

  afterEach(() => {
    if (originalStandalone === undefined) {
      delete (navigator as Record<string, unknown>).standalone;
    } else {
      Object.defineProperty(navigator, 'standalone', {
        value: originalStandalone,
        writable: true,
        configurable: true,
      });
    }
    window.matchMedia = originalMatchMedia;
    vi.resetModules();
  });

  it('returns true when navigator.standalone is true (iOS Safari)', async () => {
    Object.defineProperty(navigator, 'standalone', {
      value: true,
      writable: true,
      configurable: true,
    });

    const { isStandaloneMode } = await import('./fullscreen');
    expect(isStandaloneMode()).toBe(true);
  });

  it('returns true when matchMedia matches standalone display-mode', async () => {
    Object.defineProperty(navigator, 'standalone', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(display-mode: standalone)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    }));

    const { isStandaloneMode } = await import('./fullscreen');
    expect(isStandaloneMode()).toBe(true);
  });

  it('returns false when neither condition is met (regular browser)', async () => {
    Object.defineProperty(navigator, 'standalone', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    }));

    const { isStandaloneMode } = await import('./fullscreen');
    expect(isStandaloneMode()).toBe(false);
  });
});

describe('requestFullscreen', () => {
  let originalStandalone: unknown;
  let originalMatchMedia: typeof window.matchMedia;

  beforeEach(() => {
    originalStandalone = (navigator as Record<string, unknown>).standalone;
    originalMatchMedia = window.matchMedia;
  });

  afterEach(() => {
    if (originalStandalone === undefined) {
      delete (navigator as Record<string, unknown>).standalone;
    } else {
      Object.defineProperty(navigator, 'standalone', {
        value: originalStandalone,
        writable: true,
        configurable: true,
      });
    }
    window.matchMedia = originalMatchMedia;
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('skips Fullscreen API call in standalone mode', async () => {
    Object.defineProperty(navigator, 'standalone', {
      value: true,
      writable: true,
      configurable: true,
    });

    const mockRequestFullscreen = vi.fn().mockResolvedValue(undefined);
    document.documentElement.requestFullscreen = mockRequestFullscreen;

    const { requestFullscreen } = await import('./fullscreen');
    requestFullscreen();

    expect(mockRequestFullscreen).not.toHaveBeenCalled();
  });

  it('calls requestFullscreen() in browser mode', async () => {
    Object.defineProperty(navigator, 'standalone', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    }));

    const mockRequestFullscreen = vi.fn().mockResolvedValue(undefined);
    document.documentElement.requestFullscreen = mockRequestFullscreen;

    const { requestFullscreen } = await import('./fullscreen');
    requestFullscreen();

    expect(mockRequestFullscreen).toHaveBeenCalledOnce();
  });

  it('calls webkitRequestFullscreen() when standard API unavailable', async () => {
    Object.defineProperty(navigator, 'standalone', {
      value: undefined,
      writable: true,
      configurable: true,
    });

    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    }));

    // Remove standard API
    const el = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>;
    };
    const originalRFS = el.requestFullscreen;
    // @ts-expect-error -- intentionally removing for test
    delete el.requestFullscreen;

    const mockWebkit = vi.fn().mockResolvedValue(undefined);
    el.webkitRequestFullscreen = mockWebkit;

    const { requestFullscreen } = await import('./fullscreen');
    requestFullscreen();

    expect(mockWebkit).toHaveBeenCalledOnce();

    // Restore
    el.requestFullscreen = originalRFS;
    delete el.webkitRequestFullscreen;
  });
});

describe('manifest.json', () => {
  it('has display: "standalone" (not "fullscreen")', () => {
    const manifestPath = resolve(__dirname, '../../public/manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    expect(manifest.display).toBe('standalone');
  });

  it('does not have orientation field', () => {
    const manifestPath = resolve(__dirname, '../../public/manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    expect(manifest).not.toHaveProperty('orientation');
  });
});
