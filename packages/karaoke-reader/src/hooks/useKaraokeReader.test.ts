import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useKaraokeReader } from './useKaraokeReader.js';
import { MockAudio } from '../test-utils/mock-audio.js';
import type { WordTimestamp } from '../types.js';
import type { TtsStatus } from '../types.js';

// ============================================================
// Test data
// ============================================================

function makeTimestamps(): WordTimestamp[] {
  return [
    { word: 'Hello', startTime: 0.0, endTime: 0.5, index: 0 },
    { word: 'world', startTime: 0.6, endTime: 1.0, index: 1 },
    { word: 'test', startTime: 1.2, endTime: 1.5, index: 2 },
  ];
}

// ============================================================
// Tests
// ============================================================

describe('useKaraokeReader', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -----------------------------------------------------------
  // 1. Status idle when no audioSrc provided
  // -----------------------------------------------------------
  it('status is idle when no audioSrc provided', () => {
    const { result } = renderHook(() =>
      useKaraokeReader({ timestamps: makeTimestamps() }),
    );
    expect(result.current.status).toBe('idle');
    expect(result.current.activeWordIndex).toBe(-1);
  });

  // -----------------------------------------------------------
  // 2. Status transitions: idle -> loading -> ready
  // -----------------------------------------------------------
  it('transitions from idle to loading to ready on canplaythrough', () => {
    const audio = new MockAudio() as unknown as HTMLAudioElement;
    const mockAudio = audio as unknown as MockAudio;

    const { result } = renderHook(() =>
      useKaraokeReader({ timestamps: makeTimestamps(), audioSrc: audio }),
    );

    // After providing audioSrc, should be in loading
    expect(result.current.status).toBe('loading');

    // Simulate canplaythrough
    act(() => {
      mockAudio.simulateCanPlayThrough(5);
    });

    expect(result.current.status).toBe('ready');
  });

  // -----------------------------------------------------------
  // 3. Status transitions: ready -> playing (on play())
  // -----------------------------------------------------------
  it('transitions from ready to playing on play()', async () => {
    const audio = new MockAudio() as unknown as HTMLAudioElement;
    const mockAudio = audio as unknown as MockAudio;

    const { result } = renderHook(() =>
      useKaraokeReader({ timestamps: makeTimestamps(), audioSrc: audio }),
    );

    // Get to ready
    act(() => {
      mockAudio.simulateCanPlayThrough(5);
    });
    expect(result.current.status).toBe('ready');

    // Play
    await act(async () => {
      result.current.play();
    });

    expect(result.current.status).toBe('playing');
  });

  // -----------------------------------------------------------
  // 4. Status transitions: playing -> paused (on pause())
  // -----------------------------------------------------------
  it('transitions from playing to paused on pause()', async () => {
    const audio = new MockAudio() as unknown as HTMLAudioElement;
    const mockAudio = audio as unknown as MockAudio;

    const { result } = renderHook(() =>
      useKaraokeReader({ timestamps: makeTimestamps(), audioSrc: audio }),
    );

    act(() => {
      mockAudio.simulateCanPlayThrough(5);
    });

    await act(async () => {
      result.current.play();
    });
    expect(result.current.status).toBe('playing');

    act(() => {
      result.current.pause();
    });
    expect(result.current.status).toBe('paused');
  });

  // -----------------------------------------------------------
  // 5. Status transitions: playing -> done (on ended)
  // -----------------------------------------------------------
  it('transitions from playing to done on ended event', async () => {
    const audio = new MockAudio() as unknown as HTMLAudioElement;
    const mockAudio = audio as unknown as MockAudio;

    const { result } = renderHook(() =>
      useKaraokeReader({ timestamps: makeTimestamps(), audioSrc: audio }),
    );

    act(() => {
      mockAudio.simulateCanPlayThrough(5);
    });

    await act(async () => {
      result.current.play();
    });
    expect(result.current.status).toBe('playing');

    act(() => {
      mockAudio.simulateEnded();
    });
    expect(result.current.status).toBe('done');
  });

  // -----------------------------------------------------------
  // 6. Status transitions: loading -> error (on error event)
  // -----------------------------------------------------------
  it('transitions to error on audio error event', () => {
    const audio = new MockAudio() as unknown as HTMLAudioElement;
    const mockAudio = audio as unknown as MockAudio;

    const { result } = renderHook(() =>
      useKaraokeReader({ timestamps: makeTimestamps(), audioSrc: audio }),
    );

    expect(result.current.status).toBe('loading');

    act(() => {
      mockAudio.simulateError();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBeInstanceOf(Error);
  });

  // -----------------------------------------------------------
  // 7. Autoplay-blocked: play() rejects with NotAllowedError -> stays in ready
  // -----------------------------------------------------------
  it('stays in ready when autoPlay is blocked by NotAllowedError (COMP-08)', async () => {
    const audio = new MockAudio() as unknown as HTMLAudioElement;
    const mockAudio = audio as unknown as MockAudio;

    // Override play to reject with NotAllowedError
    const notAllowedError = new DOMException('Autoplay blocked', 'NotAllowedError');
    mockAudio.play = () => Promise.reject(notAllowedError);

    const { result } = renderHook(() =>
      useKaraokeReader({
        timestamps: makeTimestamps(),
        audioSrc: audio,
        autoPlay: true,
      }),
    );

    // Get to ready — autoPlay effect will fire
    await act(async () => {
      mockAudio.simulateCanPlayThrough(5);
    });

    // Should stay in ready, NOT error
    expect(result.current.status).toBe('ready');
    expect(result.current.error).toBeNull();
  });

  // -----------------------------------------------------------
  // 8. onComplete fires exactly once on done (COMP-07)
  // -----------------------------------------------------------
  it('fires onComplete exactly once when playback ends (COMP-07)', async () => {
    const audio = new MockAudio() as unknown as HTMLAudioElement;
    const mockAudio = audio as unknown as MockAudio;
    const onComplete = vi.fn();

    const { result } = renderHook(() =>
      useKaraokeReader({
        timestamps: makeTimestamps(),
        audioSrc: audio,
        onComplete,
      }),
    );

    act(() => {
      mockAudio.simulateCanPlayThrough(5);
    });

    await act(async () => {
      result.current.play();
    });

    act(() => {
      mockAudio.simulateEnded();
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------
  // 9. onStatusChange fires on every transition (COMP-03)
  // -----------------------------------------------------------
  it('fires onStatusChange on every status transition (COMP-03)', async () => {
    const audio = new MockAudio() as unknown as HTMLAudioElement;
    const mockAudio = audio as unknown as MockAudio;
    const statusHistory: TtsStatus[] = [];

    renderHook(() =>
      useKaraokeReader({
        timestamps: makeTimestamps(),
        audioSrc: audio,
        onStatusChange: (s) => statusHistory.push(s),
      }),
    );

    // idle -> loading (on mount with audioSrc)
    // loading already recorded

    act(() => {
      mockAudio.simulateCanPlayThrough(5);
    });

    // Should have recorded transitions
    expect(statusHistory).toContain('loading');
    expect(statusHistory).toContain('ready');
  });

  // -----------------------------------------------------------
  // 10. onError fires on error state
  // -----------------------------------------------------------
  it('fires onError when audio encounters an error', () => {
    const audio = new MockAudio() as unknown as HTMLAudioElement;
    const mockAudio = audio as unknown as MockAudio;
    const onError = vi.fn();

    renderHook(() =>
      useKaraokeReader({
        timestamps: makeTimestamps(),
        audioSrc: audio,
        onError,
      }),
    );

    act(() => {
      mockAudio.simulateError();
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  // -----------------------------------------------------------
  // 11. Volume control: setVolume(0.5) updates audio.volume (COMP-06)
  // -----------------------------------------------------------
  it('setVolume updates audio.volume (COMP-06)', () => {
    const audio = new MockAudio() as unknown as HTMLAudioElement;
    const mockAudio = audio as unknown as MockAudio;

    const { result } = renderHook(() =>
      useKaraokeReader({
        timestamps: makeTimestamps(),
        audioSrc: audio,
      }),
    );

    act(() => {
      result.current.setVolume(0.5);
    });

    expect(result.current.volume).toBe(0.5);
    expect(mockAudio.volume).toBe(0.5);
  });

  // -----------------------------------------------------------
  // 12. toggle() switches between playing and paused (COMP-05)
  // -----------------------------------------------------------
  it('toggle() switches between playing and paused (COMP-05)', async () => {
    const audio = new MockAudio() as unknown as HTMLAudioElement;
    const mockAudio = audio as unknown as MockAudio;

    const { result } = renderHook(() =>
      useKaraokeReader({ timestamps: makeTimestamps(), audioSrc: audio }),
    );

    act(() => {
      mockAudio.simulateCanPlayThrough(5);
    });
    expect(result.current.status).toBe('ready');

    // Toggle from ready -> playing
    await act(async () => {
      result.current.toggle();
    });
    expect(result.current.status).toBe('playing');

    // Toggle from playing -> paused
    act(() => {
      result.current.toggle();
    });
    expect(result.current.status).toBe('paused');

    // Toggle from paused -> playing
    await act(async () => {
      result.current.toggle();
    });
    expect(result.current.status).toBe('playing');
  });

  // -----------------------------------------------------------
  // 13. Cleanup: audio paused on unmount
  // -----------------------------------------------------------
  it('pauses audio on unmount', async () => {
    const audio = new MockAudio() as unknown as HTMLAudioElement;
    const mockAudio = audio as unknown as MockAudio;
    const pauseSpy = vi.spyOn(mockAudio, 'pause');

    const { result, unmount } = renderHook(() =>
      useKaraokeReader({ timestamps: makeTimestamps(), audioSrc: audio }),
    );

    act(() => {
      mockAudio.simulateCanPlayThrough(5);
    });

    await act(async () => {
      result.current.play();
    });

    // Clear any previous pause calls
    pauseSpy.mockClear();

    unmount();

    // Cleanup should pause the audio
    expect(pauseSpy).toHaveBeenCalled();
    pauseSpy.mockRestore();
  });
});
