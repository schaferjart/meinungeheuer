// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePortraitCapture } from './usePortraitCapture';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockVideo(overrides: Partial<HTMLVideoElement> = {}) {
  return {
    readyState: 4, // HAVE_ENOUGH_DATA
    videoWidth: 1280,
    videoHeight: 960,
    ...overrides,
  } as unknown as HTMLVideoElement;
}

function createMockCanvas(blobSize = 50_000) {
  const drawImage = vi.fn();
  const getContext = vi.fn().mockReturnValue({ drawImage });
  const toBlob = vi.fn((cb: BlobCallback, _type?: string, _quality?: number) => {
    const blob = new Blob(['x'.repeat(blobSize)], { type: 'image/jpeg' });
    cb(blob);
  });

  return { getContext, toBlob, drawImage, width: 0, height: 0 };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('usePortraitCapture', () => {
  let originalCreateElement: typeof document.createElement;
  let mockCanvas: ReturnType<typeof createMockCanvas>;

  beforeEach(() => {
    originalCreateElement = document.createElement.bind(document);
    mockCanvas = createMockCanvas();

    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') return mockCanvas as unknown as HTMLCanvasElement;
      return originalCreateElement(tag);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // captureFrame
  // -------------------------------------------------------------------------

  describe('captureFrame', () => {
    it('returns a Blob when video is ready (readyState >= 2, videoWidth > 0)', async () => {
      const video = createMockVideo();
      const videoRef = { current: video };

      const { result } = renderHook(() =>
        usePortraitCapture({ videoRef, posServerUrl: '' }),
      );

      let blob: Blob | null = null;
      await act(async () => {
        blob = await result.current.captureFrame();
      });

      expect(blob).toBeInstanceOf(Blob);
      expect(blob!.size).toBeGreaterThan(1024);
      expect(mockCanvas.getContext).toHaveBeenCalledWith('2d');
      expect(mockCanvas.drawImage).toHaveBeenCalledWith(video, 0, 0);
    });

    it('returns null when video readyState < 2', async () => {
      const video = createMockVideo({ readyState: 1 });
      const videoRef = { current: video };

      const { result } = renderHook(() =>
        usePortraitCapture({ videoRef, posServerUrl: '' }),
      );

      let blob: Blob | null = null;
      await act(async () => {
        blob = await result.current.captureFrame();
      });

      expect(blob).toBeNull();
    });

    it('returns null when videoWidth === 0', async () => {
      const video = createMockVideo({ videoWidth: 0 });
      const videoRef = { current: video };

      const { result } = renderHook(() =>
        usePortraitCapture({ videoRef, posServerUrl: '' }),
      );

      let blob: Blob | null = null;
      await act(async () => {
        blob = await result.current.captureFrame();
      });

      expect(blob).toBeNull();
    });

    it('returns null when blob size < 1KB (black frame detection)', async () => {
      // Recreate canvas mock with tiny blob
      mockCanvas = createMockCanvas(500); // 500 bytes < 1024
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'canvas') return mockCanvas as unknown as HTMLCanvasElement;
        return originalCreateElement(tag);
      });

      const video = createMockVideo();
      const videoRef = { current: video };

      const { result } = renderHook(() =>
        usePortraitCapture({ videoRef, posServerUrl: '' }),
      );

      let blob: Blob | null = null;
      await act(async () => {
        blob = await result.current.captureFrame();
      });

      expect(blob).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // uploadForProcessing (Phase 1)
  // -------------------------------------------------------------------------

  describe('uploadForProcessing', () => {
    it('sends FormData POST and returns job_id from response', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'processing', job_id: 'test-job-123' }),
      });
      vi.stubGlobal('fetch', fetchSpy);

      const videoRef = { current: createMockVideo() };
      const { result } = renderHook(() =>
        usePortraitCapture({ videoRef, posServerUrl: 'http://localhost:9100' }),
      );

      const blob = new Blob(['test'], { type: 'image/jpeg' });
      let jobId: string | null = null;
      await act(async () => {
        jobId = await result.current.uploadForProcessing(blob);
      });

      expect(jobId).toBe('test-job-123');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://localhost:9100/portrait/capture');
      expect(opts.method).toBe('POST');

      const body = opts.body as FormData;
      expect(body.get('skip_selection')).toBe('true');
      expect(body.get('file')).toBeInstanceOf(Blob);

      vi.unstubAllGlobals();
    });

    it('returns null when posServerUrl is empty', async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);

      const videoRef = { current: createMockVideo() };
      const { result } = renderHook(() =>
        usePortraitCapture({ videoRef, posServerUrl: '' }),
      );

      const blob = new Blob(['test'], { type: 'image/jpeg' });
      let jobId: string | null = null;
      await act(async () => {
        jobId = await result.current.uploadForProcessing(blob);
      });

      expect(jobId).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();

      vi.unstubAllGlobals();
    });

    it('returns null and sets lastError on fetch failure', async () => {
      const fetchSpy = vi.fn().mockRejectedValue(new Error('Network error'));
      vi.stubGlobal('fetch', fetchSpy);

      const videoRef = { current: createMockVideo() };
      const { result } = renderHook(() =>
        usePortraitCapture({ videoRef, posServerUrl: 'http://localhost:9100' }),
      );

      const blob = new Blob(['test'], { type: 'image/jpeg' });
      let jobId: string | null = null;
      await act(async () => {
        jobId = await result.current.uploadForProcessing(blob);
      });

      expect(jobId).toBeNull();
      expect(result.current.lastError).toBe('Network error');

      vi.unstubAllGlobals();
    });
  });

  // -------------------------------------------------------------------------
  // finalizePortrait (Phase 2)
  // -------------------------------------------------------------------------

  describe('finalizePortrait', () => {
    it('sends JSON POST with job_id and duration_seconds', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'ok', width_percent: 42.5 }),
      });
      vi.stubGlobal('fetch', fetchSpy);

      const videoRef = { current: createMockVideo() };
      const { result } = renderHook(() =>
        usePortraitCapture({ videoRef, posServerUrl: 'http://localhost:9100' }),
      );

      await act(async () => {
        await result.current.finalizePortrait('job-abc', 120);
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://localhost:9100/portrait/finalize');
      expect(opts.method).toBe('POST');
      expect(opts.headers).toEqual({ 'Content-Type': 'application/json' });
      expect(JSON.parse(opts.body as string)).toEqual({
        job_id: 'job-abc',
        duration_seconds: 120,
      });

      vi.unstubAllGlobals();
    });

    it('sets isProcessing during finalize and clears after', async () => {
      let resolveFetch!: (value: { ok: boolean; json: () => Promise<unknown> }) => void;
      const fetchSpy = vi.fn().mockReturnValue(
        new Promise((r) => {
          resolveFetch = r;
        }),
      );
      vi.stubGlobal('fetch', fetchSpy);

      const videoRef = { current: createMockVideo() };
      const { result } = renderHook(() =>
        usePortraitCapture({ videoRef, posServerUrl: 'http://localhost:9100' }),
      );

      expect(result.current.isProcessing).toBe(false);

      let finalizePromise: Promise<void>;
      act(() => {
        finalizePromise = result.current.finalizePortrait('job-abc', 60);
      });

      expect(result.current.isProcessing).toBe(true);

      await act(async () => {
        resolveFetch({
          ok: true,
          json: () => Promise.resolve({ status: 'ok', width_percent: 90 }),
        });
        await finalizePromise!;
      });

      expect(result.current.isProcessing).toBe(false);

      vi.unstubAllGlobals();
    });

    it('sets lastError on finalize failure, never throws', async () => {
      const fetchSpy = vi.fn().mockRejectedValue(new Error('Server down'));
      vi.stubGlobal('fetch', fetchSpy);

      const videoRef = { current: createMockVideo() };
      const { result } = renderHook(() =>
        usePortraitCapture({ videoRef, posServerUrl: 'http://localhost:9100' }),
      );

      await act(async () => {
        await result.current.finalizePortrait('job-abc', 300);
      });

      expect(result.current.lastError).toBe('Server down');

      vi.unstubAllGlobals();
    });
  });
});
