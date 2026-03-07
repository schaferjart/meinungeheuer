import { useCallback, useEffect, useRef, useState } from 'react';
import type { WordTimestamp } from '../types.js';

// ============================================================
// Types
// ============================================================

export interface UseAudioSyncParams {
  /** The audio element to synchronize with. */
  audio: HTMLAudioElement | null;
  /** Sorted word-level timestamps (by startTime). */
  timestamps: WordTimestamp[];
  /** Whether the rAF loop should be running (true when playing). */
  enabled: boolean;
}

export interface UseAudioSyncReturn {
  /** Index of the currently active word, or -1 if none. */
  activeWordIndex: number;
}

// ============================================================
// Binary search (exported for direct unit testing)
// ============================================================

/**
 * Binary search over sorted WordTimestamp[] to find the word whose
 * [startTime, endTime) bracket contains the given time `t`.
 *
 * Returns the matched index, or -1 if `t` is before the first word.
 * When `t` falls in a gap between words, returns the last word whose
 * endTime has passed (i.e. the most recently spoken word).
 */
export function findActiveWordIndex(
  timestamps: WordTimestamp[],
  t: number,
): number {
  if (timestamps.length === 0) return -1;

  let lo = 0;
  let hi = timestamps.length - 1;
  let foundIndex = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const w = timestamps[mid];
    if (!w) break;

    if (w.endTime <= t) {
      lo = mid + 1;
    } else if (w.startTime > t) {
      hi = mid - 1;
    } else {
      foundIndex = mid;
      break;
    }
  }

  // Gap between words: keep highlighting the last word we passed
  if (foundIndex === -1 && lo > 0) {
    foundIndex = lo - 1;
  }

  return foundIndex;
}

// ============================================================
// Hook
// ============================================================

/**
 * Synchronizes an `activeWordIndex` to an HTMLAudioElement's currentTime
 * at ~60fps using requestAnimationFrame and binary search over sorted
 * WordTimestamp[].
 *
 * The rAF loop runs only when `enabled` is true and `audio` is non-null.
 * Returns -1 when no word is active (empty timestamps or currentTime
 * before the first word).
 */
export function useAudioSync(params: UseAudioSyncParams): UseAudioSyncReturn {
  const { audio, timestamps, enabled } = params;

  const [activeWordIndex, setActiveWordIndex] = useState<number>(-1);
  const animationFrameRef = useRef<number | null>(null);

  // Keep timestamps in a ref so the rAF callback always reads latest
  const timestampsRef = useRef<WordTimestamp[]>(timestamps);
  timestampsRef.current = timestamps;

  // Keep audio in a ref for stable callback reference
  const audioRef = useRef<HTMLAudioElement | null>(audio);
  audioRef.current = audio;

  const updateActiveWord = useCallback(() => {
    const el = audioRef.current;
    const cues = timestampsRef.current;

    if (!el || cues.length === 0) {
      animationFrameRef.current = requestAnimationFrame(updateActiveWord);
      return;
    }

    const t = el.currentTime;
    const index = findActiveWordIndex(cues, t);

    setActiveWordIndex((prev) => (prev !== index ? index : prev));
    animationFrameRef.current = requestAnimationFrame(updateActiveWord);
  }, []);

  const stopLoop = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  // Start/stop the rAF loop based on `enabled`
  useEffect(() => {
    if (enabled && audio) {
      // Start the loop
      if (animationFrameRef.current === null) {
        animationFrameRef.current = requestAnimationFrame(updateActiveWord);
      }
    } else {
      stopLoop();
    }

    return () => {
      stopLoop();
    };
  }, [enabled, audio, updateActiveWord, stopLoop]);

  // Reset activeWordIndex when timestamps change
  useEffect(() => {
    setActiveWordIndex(-1);
  }, [timestamps]);

  return { activeWordIndex };
}
