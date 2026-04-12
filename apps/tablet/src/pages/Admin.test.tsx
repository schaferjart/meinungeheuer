/**
 * @vitest-environment jsdom
 *
 * Mobile-readiness tests for the Admin page.
 * Verifies touch targets, scrollability, input sizing, and tap feedback.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Admin } from './Admin';

// ---------------------------------------------------------------------------
// Mock all fetch calls — Admin makes 3 requests on mount
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        mode: 'term_only',
        term: 'TEST',
        chain_context: null,
        // definitions endpoint
        definitions: [],
        total: 0,
        limit: 20,
        offset: 0,
        // chain endpoint
        chain: [],
      }),
      text: async () => '',
    }),
  );
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Apple HIG minimum touch target: 44x44 CSS pixels */
const MIN_TOUCH_PX = 44;

/** Parse numeric px from a Tailwind class like py-3 → 12, py-2 → 8, etc. */
function verticalPaddingPx(className: string): number {
  // py-{n}: Tailwind spacing scale → px
  const match = className.match(/py-(\d+(?:\.\d+)?)/);
  if (!match?.[1]) return 0;
  const scale = parseFloat(match[1]);
  return scale * 4; // Tailwind 1 unit = 4px
}

/**
 * Estimate the rendered height of a button from its classes.
 * height ≈ line-height + 2 × padding-y.
 * text-sm = 20px line-height, text-base = 24px, text-xs = 16px.
 */
function estimatedHeight(el: HTMLElement): number {
  const cls = el.className;
  // Determine line height from text size class
  let lineHeight = 20; // text-sm default
  if (cls.includes('text-base')) lineHeight = 24;
  if (cls.includes('text-xs')) lineHeight = 16;
  if (cls.includes('text-lg')) lineHeight = 28;

  // Get the FIRST py value (mobile-first, before sm: overrides)
  const pyMatches = cls.match(/(?:^|\s)py-(\d+(?:\.\d+)?)/);
  const py = pyMatches?.[1] ? parseFloat(pyMatches[1]) * 4 : 0;

  return lineHeight + 2 * py;
}

/**
 * Check if an element has a class that provides visual tap/press feedback.
 * On mobile, `:active` CSS pseudo-class alone is unreliable (iOS Safari
 * requires a touchstart listener). So we check for either:
 * - `active:` Tailwind modifier (good if onTouchStart is on an ancestor)
 * - `ontouchstart` attribute (inline empty handler trick)
 */
function hasTapFeedback(el: HTMLElement): boolean {
  const cls = el.className;
  return cls.includes('active:');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Admin mobile readiness', () => {
  it('page is scrollable and not clipped', async () => {
    const { container } = render(<Admin />);
    const root = container.firstElementChild as HTMLElement;

    // Must NOT include classes that prevent page scrolling
    // The kiosk app sets overflow:hidden globally; admin must override it
    expect(root.className).not.toMatch(/(?:^|\s)overflow-hidden(?:\s|$)/);
  });

  it('root container is scrollable (overrides global overflow:hidden)', async () => {
    const { container } = render(<Admin />);
    const root = container.firstElementChild as HTMLElement;

    expect(root.className).toContain('overflow-y-auto');
    expect(root.className).toContain('fixed');
    expect(root.className).not.toContain('min-h-screen');
    // Must NOT have overflow-hidden which would prevent scrolling
    expect(root.className).not.toContain('overflow-hidden');
  });

  it('root container enables :active on iOS via onTouchStart', async () => {
    // Spy on addEventListener to detect if React registers a touchstart handler.
    // React uses event delegation — it registers handlers on the root or container,
    // but we can detect that a touchstart listener was attached somewhere.
    const addEventSpy = vi.spyOn(HTMLElement.prototype, 'addEventListener');

    render(<Admin />);

    // React 18 synthetic events: onTouchStart registers a 'touchstart' listener
    const touchstartRegistered = addEventSpy.mock.calls.some(
      (call) => call[0] === 'touchstart',
    );

    addEventSpy.mockRestore();

    expect(
      touchstartRegistered,
      'Root must have onTouchStart handler to enable :active CSS on iOS Safari. ' +
        'Without it, all active: Tailwind tap-feedback classes silently fail on touch devices.',
    ).toBe(true);
  });

  it('all <button> elements meet 44px minimum touch target', async () => {
    render(<Admin />);
    const buttons = screen.getAllByRole('button');

    const tooSmall: string[] = [];
    for (const btn of buttons) {
      const h = estimatedHeight(btn);
      if (h < MIN_TOUCH_PX) {
        tooSmall.push(
          `"${btn.textContent?.trim()}" — estimated ${h}px (classes: ${btn.className})`,
        );
      }
    }

    expect(tooSmall, `Buttons below ${MIN_TOUCH_PX}px touch target:\n${tooSmall.join('\n')}`).toHaveLength(0);
  });

  it('all <button> elements have visual tap feedback class', async () => {
    render(<Admin />);
    const buttons = screen.getAllByRole('button');

    const noFeedback: string[] = [];
    for (const btn of buttons) {
      if (!hasTapFeedback(btn)) {
        noFeedback.push(`"${btn.textContent?.trim()}" — classes: ${btn.className}`);
      }
    }

    expect(
      noFeedback,
      `Buttons without active: tap feedback:\n${noFeedback.join('\n')}`,
    ).toHaveLength(0);
  });

  it('text inputs have font-size >= 16px to prevent iOS auto-zoom', async () => {
    render(<Admin />);
    const inputs = screen.getAllByRole('textbox');

    for (const input of inputs) {
      const cls = input.className;
      // text-base = 16px (safe). text-sm = 14px (triggers iOS zoom).
      // Mobile-first: the FIRST text size class (before sm:) is what matters.
      const hasSmFirst = /(?:^|\s)text-sm(?:\s|$)/.test(cls) && !cls.includes('text-base');
      const hasXsFirst = /(?:^|\s)text-xs(?:\s|$)/.test(cls) && !cls.includes('text-base');

      expect(
        hasSmFirst || hasXsFirst,
        `Input "${input.getAttribute('placeholder')}" uses text-sm or text-xs — will trigger iOS auto-zoom. Use text-base on mobile.`,
      ).toBe(false);
    }
  });

  it('no table overflows parent due to conflicting overflow classes', async () => {
    const { container } = render(<Admin />);
    const root = container.firstElementChild as HTMLElement;

    // Root must not clip horizontally in a way that breaks table scrolling
    // overflow-x-hidden on root is fine if table wrappers have overflow-auto
    if (root.className.includes('overflow-x-hidden')) {
      // Every table's parent wrapper must have overflow-auto
      const tables = container.querySelectorAll('table');
      for (const table of tables) {
        const wrapper = table.parentElement;
        expect(
          wrapper?.className,
          'Table wrapper must have overflow-auto for horizontal scrolling',
        ).toContain('overflow-auto');
      }
    }
  });
});
