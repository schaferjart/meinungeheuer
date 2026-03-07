import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAutoScroll } from './useAutoScroll.js';
import type { RefObject } from 'react';

// ============================================================
// Helpers
// ============================================================

function createMockContainer(height = 600) {
  const el = document.createElement('div');
  el.scrollBy = vi.fn();
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    top: 0,
    bottom: height,
    left: 0,
    right: 400,
    width: 400,
    height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  return el;
}

function createMockWord(topRelativeToViewport: number) {
  const el = document.createElement('span');
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    top: topRelativeToViewport,
    bottom: topRelativeToViewport + 20,
    left: 0,
    right: 100,
    width: 100,
    height: 20,
    x: 0,
    y: topRelativeToViewport,
    toJSON: () => ({}),
  });
  return el;
}

function makeRefs(container: HTMLDivElement, wordMap: Map<number, HTMLSpanElement>) {
  return {
    containerRef: { current: container } as RefObject<HTMLDivElement>,
    wordElementsRef: { current: wordMap } as RefObject<Map<number, HTMLSpanElement>>,
  };
}

// ============================================================
// Tests
// ============================================================

describe('useAutoScroll', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('triggers scroll when word is below comfort zone (>65%)', () => {
    const container = createMockContainer(600);
    // Word at 70% of container (420px in a 600px container) — outside comfort zone
    const word = createMockWord(420);
    const wordMap = new Map<number, HTMLSpanElement>([[5, word]]);
    const { containerRef, wordElementsRef } = makeRefs(container, wordMap);

    renderHook(
      ({ activeWordIndex }) =>
        useAutoScroll({ containerRef, activeWordIndex, wordElementsRef }),
      { initialProps: { activeWordIndex: -1 } },
    );

    // No scroll yet at index -1
    expect(container.scrollBy).not.toHaveBeenCalled();
  });

  it('triggers scroll when active word is outside comfort zone', () => {
    const container = createMockContainer(600);
    // Word at 70% of container height (420px) — below comfort bottom (65% = 390px)
    const word = createMockWord(420);
    const wordMap = new Map<number, HTMLSpanElement>([[5, word]]);
    const { containerRef, wordElementsRef } = makeRefs(container, wordMap);

    const { rerender } = renderHook(
      ({ activeWordIndex }) =>
        useAutoScroll({ containerRef, activeWordIndex, wordElementsRef }),
      { initialProps: { activeWordIndex: -1 } },
    );

    rerender({ activeWordIndex: 5 });

    // Should scroll: word at 420, target is 35% of 600 = 210, scrollBy top = 420 - 210 = 210
    expect(container.scrollBy).toHaveBeenCalledWith({
      top: 210,
      behavior: 'smooth',
    });
  });

  it('does NOT scroll when word is inside comfort zone', () => {
    const container = createMockContainer(600);
    // Word at 40% of container (240px) — inside 20%-65% comfort zone
    const word = createMockWord(240);
    const wordMap = new Map<number, HTMLSpanElement>([[3, word]]);
    const { containerRef, wordElementsRef } = makeRefs(container, wordMap);

    const { rerender } = renderHook(
      ({ activeWordIndex }) =>
        useAutoScroll({ containerRef, activeWordIndex, wordElementsRef }),
      { initialProps: { activeWordIndex: -1 } },
    );

    rerender({ activeWordIndex: 3 });

    expect(container.scrollBy).not.toHaveBeenCalled();
  });

  it('suppresses scroll during cooldown after manual scroll event', () => {
    const container = createMockContainer(600);
    // Word below comfort zone
    const word = createMockWord(500);
    const wordMap = new Map<number, HTMLSpanElement>([[1, word], [2, word]]);
    const { containerRef, wordElementsRef } = makeRefs(container, wordMap);

    const { rerender } = renderHook(
      ({ activeWordIndex }) =>
        useAutoScroll({ containerRef, activeWordIndex, wordElementsRef, cooldownMs: 3000 }),
      { initialProps: { activeWordIndex: -1 } },
    );

    // Simulate manual scroll
    act(() => {
      container.dispatchEvent(new Event('scroll'));
    });

    // Now change active word — should be suppressed
    rerender({ activeWordIndex: 1 });
    expect(container.scrollBy).not.toHaveBeenCalled();
  });

  it('resumes auto-scroll after cooldown expires', () => {
    const container = createMockContainer(600);
    const word = createMockWord(500);
    const wordMap = new Map<number, HTMLSpanElement>([[1, word], [2, word]]);
    const { containerRef, wordElementsRef } = makeRefs(container, wordMap);

    const { rerender } = renderHook(
      ({ activeWordIndex }) =>
        useAutoScroll({ containerRef, activeWordIndex, wordElementsRef, cooldownMs: 3000 }),
      { initialProps: { activeWordIndex: -1 } },
    );

    // Manual scroll
    act(() => {
      container.dispatchEvent(new Event('scroll'));
    });

    // Advance time past cooldown
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // Now changing word should trigger scroll again
    rerender({ activeWordIndex: 2 });
    expect(container.scrollBy).toHaveBeenCalled();
  });

  it('does nothing when enabled=false', () => {
    const container = createMockContainer(600);
    const word = createMockWord(500);
    const wordMap = new Map<number, HTMLSpanElement>([[1, word]]);
    const { containerRef, wordElementsRef } = makeRefs(container, wordMap);

    const { rerender } = renderHook(
      ({ activeWordIndex }) =>
        useAutoScroll({ containerRef, activeWordIndex, wordElementsRef, enabled: false }),
      { initialProps: { activeWordIndex: -1 } },
    );

    rerender({ activeWordIndex: 1 });
    expect(container.scrollBy).not.toHaveBeenCalled();
  });

  it('handles missing word element gracefully (no crash)', () => {
    const container = createMockContainer(600);
    // Empty word map — index 99 does not exist
    const wordMap = new Map<number, HTMLSpanElement>();
    const { containerRef, wordElementsRef } = makeRefs(container, wordMap);

    const { rerender } = renderHook(
      ({ activeWordIndex }) =>
        useAutoScroll({ containerRef, activeWordIndex, wordElementsRef }),
      { initialProps: { activeWordIndex: -1 } },
    );

    // Should not throw
    expect(() => rerender({ activeWordIndex: 99 })).not.toThrow();
    expect(container.scrollBy).not.toHaveBeenCalled();
  });

  it('triggers scroll when word is above comfort zone (<20%)', () => {
    const container = createMockContainer(600);
    // Word at 10% of container (60px) — above comfort top (20% = 120px)
    const word = createMockWord(60);
    const wordMap = new Map<number, HTMLSpanElement>([[4, word]]);
    const { containerRef, wordElementsRef } = makeRefs(container, wordMap);

    const { rerender } = renderHook(
      ({ activeWordIndex }) =>
        useAutoScroll({ containerRef, activeWordIndex, wordElementsRef }),
      { initialProps: { activeWordIndex: -1 } },
    );

    rerender({ activeWordIndex: 4 });

    // Should scroll: word at 60, target = 35% of 600 = 210, scrollBy top = 60 - 210 = -150
    expect(container.scrollBy).toHaveBeenCalledWith({
      top: -150,
      behavior: 'smooth',
    });
  });
});
