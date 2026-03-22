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
        usePortraitCapture({ videoRef, printRendererUrl: '' }),
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
        usePortraitCapture({ videoRef, printRendererUrl: '' }),
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
        usePortraitCapture({ videoRef, printRendererUrl: '' }),
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
        usePortraitCapture({ videoRef, printRendererUrl: '' }),
      );

      let blob: Blob | null = null;
      await act(async () => {
        blob = await result.current.captureFrame();
      });

      expect(blob).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // uploadPortrait
  // -------------------------------------------------------------------------

  describe('uploadPortrait', () => {
    it('sends FormData POST with file field named "file" and skip_selection="true"', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchSpy);

      const videoRef = { current: createMockVideo() };
      const { result } = renderHook(() =>
        usePortraitCapture({ videoRef, printRendererUrl: 'http://localhost:8000' }),
      );

      const blob = new Blob(['test'], { type: 'image/jpeg' });
      await act(async () => {
        await result.current.uploadPortrait(blob);
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('http://localhost:8000/process/portrait');
      expect(opts.method).toBe('POST');

      const body = opts.body as FormData;
      expect(body.get('skip_selection')).toBe('true');
      const file = body.get('file');
      expect(file).toBeTruthy();
      // Verify it's a Blob/File (happy-dom may not preserve File name from FormData.append)
      expect(file).toBeInstanceOf(Blob);

      vi.unstubAllGlobals();
    });

    it('skips silently (no throw) when printRendererUrl is empty string', async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);

      const videoRef = { current: createMockVideo() };
      const { result } = renderHook(() =>
        usePortraitCapture({ videoRef, printRendererUrl: '' }),
      );

      const blob = new Blob(['test'], { type: 'image/jpeg' });
      await act(async () => {
        await result.current.uploadPortrait(blob);
      });

      expect(fetchSpy).not.toHaveBeenCalled();

      vi.unstubAllGlobals();
    });

    it('sets isCapturing true during upload, false after', async () => {
      let resolveFetch!: (value: { ok: boolean }) => void;
      const fetchSpy = vi.fn().mockReturnValue(
        new Promise((r) => {
          resolveFetch = r;
        }),
      );
      vi.stubGlobal('fetch', fetchSpy);

      const videoRef = { current: createMockVideo() };
      const { result } = renderHook(() =>
        usePortraitCapture({ videoRef, printRendererUrl: 'http://localhost:8000' }),
      );

      expect(result.current.isCapturing).toBe(false);

      const blob = new Blob(['test'], { type: 'image/jpeg' });
      let uploadPromise: Promise<void>;
      act(() => {
        uploadPromise = result.current.uploadPortrait(blob);
      });

      // isCapturing should be true while fetch is pending
      expect(result.current.isCapturing).toBe(true);

      await act(async () => {
        resolveFetch({ ok: true });
        await uploadPromise!;
      });

      expect(result.current.isCapturing).toBe(false);

      vi.unstubAllGlobals();
    });

    it('sets lastError on fetch failure, clears on retry', async () => {
      const fetchSpy = vi.fn().mockRejectedValueOnce(new Error('Network error'));
      vi.stubGlobal('fetch', fetchSpy);

      const videoRef = { current: createMockVideo() };
      const { result } = renderHook(() =>
        usePortraitCapture({ videoRef, printRendererUrl: 'http://localhost:8000' }),
      );

      const blob = new Blob(['test'], { type: 'image/jpeg' });

      // First call — should fail
      await act(async () => {
        await result.current.uploadPortrait(blob);
      });

      expect(result.current.lastError).toBe('Network error');

      // Retry — should clear error on success
      fetchSpy.mockResolvedValueOnce({ ok: true });
      await act(async () => {
        await result.current.uploadPortrait(blob);
      });

      expect(result.current.lastError).toBeNull();

      vi.unstubAllGlobals();
    });
  });

  // -------------------------------------------------------------------------
  // captureAndUpload
  // -------------------------------------------------------------------------

  describe('captureAndUpload', () => {
    it('calls captureFrame then uploadPortrait, does NOT throw', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchSpy);

      const video = createMockVideo();
      const videoRef = { current: video };
      const { result } = renderHook(() =>
        usePortraitCapture({ videoRef, printRendererUrl: 'http://localhost:8000' }),
      );

      await act(async () => {
        // Should not throw
        await result.current.captureAndUpload();
      });

      // Verify canvas was used (captureFrame) and fetch was called (uploadPortrait)
      expect(mockCanvas.getContext).toHaveBeenCalledWith('2d');
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      vi.unstubAllGlobals();
    });

    it('does not upload when captureFrame returns null', async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);

      const video = createMockVideo({ readyState: 1 }); // not ready
      const videoRef = { current: video };
      const { result } = renderHook(() =>
        usePortraitCapture({ videoRef, printRendererUrl: 'http://localhost:8000' }),
      );

      await act(async () => {
        await result.current.captureAndUpload();
      });

      expect(fetchSpy).not.toHaveBeenCalled();

      vi.unstubAllGlobals();
    });
  });
});
