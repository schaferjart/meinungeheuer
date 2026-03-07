import { useCallback, useEffect, useRef } from 'react';

// ============================================================
// Types
// ============================================================

export interface UseAutoScrollParams {
  /** Ref to the scrollable container element */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Index of the currently active word (-1 = none) */
  activeWordIndex: number;
  /** Ref to a Map of word index -> HTMLSpanElement */
  wordElementsRef: React.RefObject<Map<number, HTMLSpanElement>>;
  /** Top boundary of comfort zone as fraction 0-1 (default: 0.20) */
  comfortTop?: number;
  /** Bottom boundary of comfort zone as fraction 0-1 (default: 0.65) */
  comfortBottom?: number;
  /** Cooldown in ms after manual scroll before auto-scroll resumes (default: 3000) */
  cooldownMs?: number;
  /** Enable/disable auto-scroll (default: true) */
  enabled?: boolean;
}

// ============================================================
// Hook
// ============================================================

/**
 * Auto-scrolls a container to keep the active word within a "comfort zone"
 * (20%-65% of container height by default). After the user manually scrolls,
 * auto-scroll is suppressed for a cooldown period (3s by default).
 *
 * Extracted from TextReader.tsx comfort-zone scroll logic.
 */
export function useAutoScroll({
  containerRef,
  activeWordIndex,
  wordElementsRef,
  comfortTop = 0.20,
  comfortBottom = 0.65,
  cooldownMs = 3000,
  enabled = true,
}: UseAutoScrollParams): void {
  const lastManualScrollRef = useRef(0);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // -------------------------------------------------------------------
  // Manual scroll detection — record timestamp, schedule cooldown reset
  // -------------------------------------------------------------------
  const handleScroll = useCallback(() => {
    lastManualScrollRef.current = Date.now();
    clearTimeout(cooldownTimerRef.current);
    cooldownTimerRef.current = setTimeout(() => {
      lastManualScrollRef.current = 0;
    }, cooldownMs);
  }, [cooldownMs]);

  // Attach / detach scroll listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    container.addEventListener('scroll', handleScroll);
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [containerRef, enabled, handleScroll]);

  // Cleanup cooldown timer on unmount
  useEffect(() => {
    return () => {
      clearTimeout(cooldownTimerRef.current);
    };
  }, []);

  // -------------------------------------------------------------------
  // Auto-scroll when active word changes
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!enabled || activeWordIndex < 0) return;

    const container = containerRef.current;
    if (!container) return;

    const wordEl = wordElementsRef.current?.get(activeWordIndex);
    if (!wordEl) return;

    // Suppress during manual scroll cooldown
    const now = Date.now();
    if (lastManualScrollRef.current > 0 && now - lastManualScrollRef.current < cooldownMs) {
      return;
    }

    const wordRect = wordEl.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const relativePosition = (wordRect.top - containerRect.top) / containerRect.height;

    // If word is outside comfort zone, scroll to bring it to 35% mark
    if (relativePosition < comfortTop || relativePosition > comfortBottom) {
      const targetOffset = containerRect.height * 0.35;
      container.scrollBy({
        top: wordRect.top - containerRect.top - targetOffset,
        behavior: 'smooth',
      });
    }
  }, [activeWordIndex, containerRef, wordElementsRef, comfortTop, comfortBottom, cooldownMs, enabled]);
}
