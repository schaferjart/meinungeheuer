import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAudioSync, findActiveWordIndex } from './useAudioSync.js';
import { MockAudio } from '../test-utils/mock-audio.js';
import type { WordTimestamp } from '../types.js';

// ============================================================
// Test data
// ============================================================

function makeTimestamps(): WordTimestamp[] {
  return [
    { word: 'Hello', startTime: 0.0, endTime: 0.5, index: 0 },
    { word: 'world', startTime: 0.6, endTime: 1.0, index: 1 },
    { word: 'this', startTime: 1.2, endTime: 1.5, index: 2 },
    { word: 'is', startTime: 1.6, endTime: 1.8, index: 3 },
    { word: 'a', startTime: 2.0, endTime: 2.2, index: 4 },
    { word: 'test', startTime: 2.3, endTime: 2.8, index: 5 },
  ];
}

// ============================================================
// Unit tests: findActiveWordIndex (pure function)
// ============================================================

describe('findActiveWordIndex', () => {
  const timestamps = makeTimestamps();

  it('returns -1 for empty timestamps', () => {
    expect(findActiveWordIndex([], 1.0)).toBe(-1);
  });

  it('returns -1 when currentTime is before the first word', () => {
    expect(findActiveWordIndex(timestamps, -0.1)).toBe(-1);
  });

  it('finds the correct word when currentTime is within a word', () => {
    expect(findActiveWordIndex(timestamps, 0.0)).toBe(0); // start of first word
    expect(findActiveWordIndex(timestamps, 0.3)).toBe(0); // middle of first word
    expect(findActiveWordIndex(timestamps, 0.7)).toBe(1); // middle of second word
    expect(findActiveWordIndex(timestamps, 2.5)).toBe(5); // middle of last word
  });

  it('returns previous word index when currentTime is in a gap between words', () => {
    // Gap between word 0 (end 0.5) and word 1 (start 0.6)
    expect(findActiveWordIndex(timestamps, 0.55)).toBe(0);
    // Gap between word 1 (end 1.0) and word 2 (start 1.2)
    expect(findActiveWordIndex(timestamps, 1.1)).toBe(1);
  });

  it('returns last word index when currentTime is after the last word', () => {
    expect(findActiveWordIndex(timestamps, 5.0)).toBe(5);
  });

  it('handles single-word timestamps', () => {
    const single: WordTimestamp[] = [
      { word: 'only', startTime: 1.0, endTime: 2.0, index: 0 },
    ];
    expect(findActiveWordIndex(single, 0.5)).toBe(-1); // before
    expect(findActiveWordIndex(single, 1.5)).toBe(0); // within
    expect(findActiveWordIndex(single, 3.0)).toBe(0); // after
  });

  it('returns correct index at exact word boundaries', () => {
    // At exact endTime, the word's endTime <= t, so we move past it
    expect(findActiveWordIndex(timestamps, 0.5)).toBe(0); // endTime of word 0 => lo=1, gap fallback => 0
    // At exact startTime, startTime <= t and endTime > t => match
    expect(findActiveWordIndex(timestamps, 0.6)).toBe(1);
  });
});

// ============================================================
// Hook integration tests: useAudioSync
// ============================================================

describe('useAudioSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns -1 initially when no audio provided', () => {
    const { result } = renderHook(() =>
      useAudioSync({ audio: null, timestamps: makeTimestamps(), enabled: false }),
    );
    expect(result.current.activeWordIndex).toBe(-1);
  });

  it('returns -1 when timestamps are empty', () => {
    const audio = new MockAudio() as unknown as HTMLAudioElement;
    const { result } = renderHook(() =>
      useAudioSync({ audio, timestamps: [], enabled: true }),
    );

    // Flush a rAF tick
    act(() => {
      vi.advanceTimersByTime(16);
    });

    expect(result.current.activeWordIndex).toBe(-1);
  });

  it('updates activeWordIndex when audio.currentTime advances', () => {
    const audio = new MockAudio() as unknown as HTMLAudioElement;
    const mockAudio = audio as unknown as MockAudio;
    const timestamps = makeTimestamps();

    const { result } = renderHook(() =>
      useAudioSync({ audio, timestamps, enabled: true }),
    );

    // Advance to middle of first word
    mockAudio.currentTime = 0.3;
    act(() => {
      vi.advanceTimersByTime(16);
    });
    expect(result.current.activeWordIndex).toBe(0);

    // Advance to second word
    mockAudio.currentTime = 0.7;
    act(() => {
      vi.advanceTimersByTime(16);
    });
    expect(result.current.activeWordIndex).toBe(1);

    // Advance to last word
    mockAudio.currentTime = 2.5;
    act(() => {
      vi.advanceTimersByTime(16);
    });
    expect(result.current.activeWordIndex).toBe(5);
  });

  it('stops updating when enabled becomes false', () => {
    const audio = new MockAudio() as unknown as HTMLAudioElement;
    const mockAudio = audio as unknown as MockAudio;
    const timestamps = makeTimestamps();

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useAudioSync({ audio, timestamps, enabled }),
      { initialProps: { enabled: true } },
    );

    // First tick — word 0
    mockAudio.currentTime = 0.3;
    act(() => {
      vi.advanceTimersByTime(16);
    });
    expect(result.current.activeWordIndex).toBe(0);

    // Disable the loop
    rerender({ enabled: false });

    // Advance audio but the loop should be stopped
    mockAudio.currentTime = 2.5;
    act(() => {
      vi.advanceTimersByTime(16);
    });
    // Should still be at old index since loop is stopped
    expect(result.current.activeWordIndex).toBe(0);
  });

  it('cleans up rAF on unmount', () => {
    const cancelSpy = vi.spyOn(globalThis, 'cancelAnimationFrame');
    const audio = new MockAudio() as unknown as HTMLAudioElement;
    const timestamps = makeTimestamps();

    const { unmount } = renderHook(() =>
      useAudioSync({ audio, timestamps, enabled: true }),
    );

    // Start the loop
    act(() => {
      vi.advanceTimersByTime(16);
    });

    unmount();

    expect(cancelSpy).toHaveBeenCalled();
    cancelSpy.mockRestore();
  });

  it('resumes updating when re-enabled', () => {
    const audio = new MockAudio() as unknown as HTMLAudioElement;
    const mockAudio = audio as unknown as MockAudio;
    const timestamps = makeTimestamps();

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useAudioSync({ audio, timestamps, enabled }),
      { initialProps: { enabled: true } },
    );

    // First tick
    mockAudio.currentTime = 0.3;
    act(() => {
      vi.advanceTimersByTime(16);
    });
    expect(result.current.activeWordIndex).toBe(0);

    // Disable
    rerender({ enabled: false });

    // Re-enable
    rerender({ enabled: true });

    // Advance audio
    mockAudio.currentTime = 2.5;
    act(() => {
      vi.advanceTimersByTime(16);
    });
    expect(result.current.activeWordIndex).toBe(5);
  });
});
