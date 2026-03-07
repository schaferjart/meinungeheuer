import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { CacheAdapter, AlignmentData, TTSCacheValue } from '../../types.js';
import { fetchElevenLabsTTS, useElevenLabsTTS } from './index.js';
import type { ElevenLabsTTSOptions } from './index.js';

// ============================================================
// Test helpers
// ============================================================

function makeAlignment(text: string, startTime = 0): AlignmentData {
  const chars = text.split('');
  const startTimes: number[] = [];
  const endTimes: number[] = [];
  let t = startTime;
  for (const _char of chars) {
    startTimes.push(t);
    t += 0.05;
    endTimes.push(t);
  }
  return {
    characters: chars,
    character_start_times_seconds: startTimes,
    character_end_times_seconds: endTimes,
  };
}

function makeApiResponse(text: string, options?: { alignment?: AlignmentData | null; normalizedAlignment?: AlignmentData | null }) {
  const alignment = options?.alignment !== undefined ? options.alignment : makeAlignment(text);
  const normalizedAlignment = options?.normalizedAlignment !== undefined ? options.normalizedAlignment : null;
  return {
    audio_base64: btoa('fake-audio-data-for-' + text.slice(0, 10)),
    alignment,
    normalized_alignment: normalizedAlignment,
  };
}

function makeBaseOptions(overrides?: Partial<ElevenLabsTTSOptions>): ElevenLabsTTSOptions {
  return {
    apiKey: 'test-api-key',
    voiceId: 'test-voice-id',
    text: 'Hello world.',
    ...overrides,
  };
}

function makeMockCache(stored?: TTSCacheValue | null): CacheAdapter & { getCalls: string[]; setCalls: Array<{ key: string; value: TTSCacheValue }> } {
  const getCalls: string[] = [];
  const setCalls: Array<{ key: string; value: TTSCacheValue }> = [];
  return {
    getCalls,
    setCalls,
    async get(key: string) {
      getCalls.push(key);
      return stored ?? null;
    },
    async set(key: string, value: TTSCacheValue) {
      setCalls.push({ key, value });
    },
  };
}

// ============================================================
// Global mocks
// ============================================================

let mockFetch: ReturnType<typeof vi.fn>;
let mockCreateObjectURL: ReturnType<typeof vi.fn>;
let mockRevokeObjectURL: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  globalThis.fetch = mockFetch;

  mockCreateObjectURL = vi.fn().mockReturnValue('blob:test-url');
  mockRevokeObjectURL = vi.fn();
  globalThis.URL.createObjectURL = mockCreateObjectURL;
  globalThis.URL.revokeObjectURL = mockRevokeObjectURL;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================
// fetchElevenLabsTTS unit tests
// ============================================================

describe('fetchElevenLabsTTS', () => {
  it('happy path single chunk — returns audioUrl and timestamps', async () => {
    const text = 'Hello world.';
    const apiResponse = makeApiResponse(text);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(apiResponse),
    });

    const result = await fetchElevenLabsTTS(makeBaseOptions({ text }));

    expect(result.audioUrl).toBe('blob:test-url');
    expect(result.timestamps).toHaveLength(2); // "Hello" and "world."
    expect(result.timestamps[0]?.word).toBe('Hello');
    expect(result.timestamps[1]?.word).toBe('world.');
    expect(result.timestamps[0]?.index).toBe(0);
    expect(result.timestamps[1]?.index).toBe(1);
    expect(typeof result.timestamps[0]?.startTime).toBe('number');
    expect(typeof result.timestamps[0]?.endTime).toBe('number');

    // Verify fetch was called with correct URL and headers
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('api.elevenlabs.io');
    expect(url).toContain('test-voice-id');
    expect((init.headers as Record<string, string>)['xi-api-key']).toBe('test-api-key');
  });

  it('multi-chunk orchestration — correct time offsets and word reindexing', async () => {
    // splitTextIntoChunks with maxWordsPerChunk: 6 splits this into exactly 2 chunks:
    // chunk1: "First sentence here. Second sentence here."
    // chunk2: "Third sentence now. Fourth sentence finally."
    const chunk1Text = 'First sentence here. Second sentence here.';
    const chunk2Text = 'Third sentence now. Fourth sentence finally.';
    const text = chunk1Text + ' ' + chunk2Text;

    const alignment1 = makeAlignment(chunk1Text, 0);
    const alignment2 = makeAlignment(chunk2Text, 0);

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          audio_base64: btoa('chunk1'),
          alignment: alignment1,
          normalized_alignment: null,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          audio_base64: btoa('chunk2'),
          alignment: alignment2,
          normalized_alignment: null,
        }),
      });

    const result = await fetchElevenLabsTTS(makeBaseOptions({
      text,
      maxWordsPerChunk: 6,
    }));

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.timestamps.length).toBeGreaterThan(0);

    // Word indices should be sequential across chunks
    for (let i = 0; i < result.timestamps.length; i++) {
      expect(result.timestamps[i]?.index).toBe(i);
    }

    // Timestamps from second chunk should have accumulated time offset
    const chunk1Words = chunk1Text.split(/\s+/).filter(Boolean).length;
    const secondChunkStart = result.timestamps[chunk1Words];
    expect(secondChunkStart).toBeDefined();
    if (secondChunkStart) {
      expect(secondChunkStart.startTime).toBeGreaterThan(0);
    }
  });

  it('prefers alignment over normalized_alignment', async () => {
    const text = 'Test text.';
    const alignment = makeAlignment(text, 0);
    const normalizedAlignment = makeAlignment(text, 100); // different start time

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        audio_base64: btoa('audio'),
        alignment,
        normalized_alignment: normalizedAlignment,
      }),
    });

    const result = await fetchElevenLabsTTS(makeBaseOptions({ text }));

    // Should use alignment (start time 0), not normalized (start time 100)
    expect(result.timestamps[0]?.startTime).toBeLessThan(1);
  });

  it('falls back to normalized_alignment when alignment is null', async () => {
    const text = 'Fallback test.';
    const normalizedAlignment = makeAlignment(text, 0);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        audio_base64: btoa('audio'),
        alignment: null,
        normalized_alignment: normalizedAlignment,
      }),
    });

    const result = await fetchElevenLabsTTS(makeBaseOptions({ text }));

    expect(result.timestamps).toHaveLength(2); // "Fallback" and "test."
    expect(result.timestamps[0]?.word).toBe('Fallback');
  });

  it('cache hit — returns cached data, does NOT call fetch', async () => {
    const cachedValue: TTSCacheValue = {
      audioBase64Parts: [btoa('cached-audio')],
      wordTimestamps: [
        { word: 'Cached', startTime: 0, endTime: 0.5, index: 0 },
        { word: 'word.', startTime: 0.5, endTime: 1.0, index: 1 },
      ],
    };
    const cache = makeMockCache(cachedValue);

    const result = await fetchElevenLabsTTS(makeBaseOptions({ cache }));

    expect(result.audioUrl).toBe('blob:test-url');
    expect(result.timestamps).toEqual(cachedValue.wordTimestamps);
    expect(mockFetch).not.toHaveBeenCalled();
    expect(cache.getCalls).toHaveLength(1);
  });

  it('cache miss + store — fetches from API, stores in cache', async () => {
    const cache = makeMockCache(null);
    const text = 'Cache miss.';

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(makeApiResponse(text)),
    });

    const result = await fetchElevenLabsTTS(makeBaseOptions({ text, cache }));

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.timestamps).toHaveLength(2);
    expect(cache.getCalls).toHaveLength(1);

    // Wait for fire-and-forget cache set
    await vi.waitFor(() => {
      expect(cache.setCalls).toHaveLength(1);
    });
    expect(cache.setCalls[0]?.value.audioBase64Parts).toHaveLength(1);
    expect(cache.setCalls[0]?.value.wordTimestamps).toHaveLength(2);
  });

  it('cache get error swallowed — fetch still succeeds', async () => {
    const cache: CacheAdapter = {
      async get() {
        throw new Error('Cache read failure');
      },
      async set() {
        // no-op
      },
    };
    const text = 'Error test.';

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(makeApiResponse(text)),
    });

    const result = await fetchElevenLabsTTS(makeBaseOptions({ text, cache }));

    expect(result.timestamps).toHaveLength(2);
    expect(result.audioUrl).toBe('blob:test-url');
  });

  it('cache set error swallowed — result still returned', async () => {
    const cache: CacheAdapter = {
      async get() {
        return null;
      },
      async set() {
        throw new Error('Cache write failure');
      },
    };
    const text = 'Set error.';

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(makeApiResponse(text)),
    });

    // Should not throw even though cache.set throws
    const result = await fetchElevenLabsTTS(makeBaseOptions({ text, cache }));

    expect(result.timestamps).toHaveLength(2);
    expect(result.audioUrl).toBe('blob:test-url');
  });

  it('API error response — throws descriptive error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: () => Promise.resolve('Invalid voice ID'),
    });

    await expect(
      fetchElevenLabsTTS(makeBaseOptions()),
    ).rejects.toThrow('ElevenLabs TTS API error (400): Invalid voice ID');
  });

  it('missing alignment data — throws descriptive error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        audio_base64: btoa('audio'),
        alignment: null,
        normalized_alignment: null,
      }),
    });

    await expect(
      fetchElevenLabsTTS(makeBaseOptions()),
    ).rejects.toThrow('no alignment data');
  });

  it('AbortSignal — rejects with AbortError', async () => {
    const controller = new AbortController();
    controller.abort();

    mockFetch.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'));

    await expect(
      fetchElevenLabsTTS(makeBaseOptions({ signal: controller.signal })),
    ).rejects.toThrow('Aborted');
  });
});

// ============================================================
// useElevenLabsTTS hook tests
// ============================================================

describe('useElevenLabsTTS', () => {
  it('status transitions on success: idle -> loading -> ready', async () => {
    const text = 'Hook success.';
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(makeApiResponse(text)),
    });

    const options = makeBaseOptions({ text });
    const { result } = renderHook(() => useElevenLabsTTS(options));

    // Initial render may be idle or loading
    expect(['idle', 'loading']).toContain(result.current.status);

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    expect(result.current.result).not.toBeNull();
    expect(result.current.result?.audioUrl).toBe('blob:test-url');
    expect(result.current.result?.timestamps).toHaveLength(2);
    expect(result.current.error).toBeNull();
  });

  it('status transitions on error: idle -> loading -> error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Server error'),
    });

    const options = makeBaseOptions({ text: 'Error hook.' });
    const { result } = renderHook(() => useElevenLabsTTS(options));

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });

    expect(result.current.error).not.toBeNull();
    expect(result.current.error?.message).toContain('500');
    expect(result.current.result).toBeNull();
  });

  it('null options stays idle — no fetch triggered', () => {
    const { result } = renderHook(() => useElevenLabsTTS(null));

    expect(result.current.status).toBe('idle');
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('cleanup revokes blob URL on unmount', async () => {
    const text = 'Cleanup test.';
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(makeApiResponse(text)),
    });

    const options = makeBaseOptions({ text });
    const { result, unmount } = renderHook(() => useElevenLabsTTS(options));

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    act(() => {
      unmount();
    });

    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:test-url');
  });

  it('cleanup aborts in-flight request on unmount', async () => {
    // Use a fetch that never resolves so we can unmount during loading
    let fetchAborted = false;
    mockFetch.mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          fetchAborted = true;
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    const options = makeBaseOptions({ text: 'Abort test.' });
    const { result, unmount } = renderHook(() => useElevenLabsTTS(options));

    // Wait for loading state
    await waitFor(() => {
      expect(result.current.status).toBe('loading');
    });

    act(() => {
      unmount();
    });

    expect(fetchAborted).toBe(true);
  });
});
