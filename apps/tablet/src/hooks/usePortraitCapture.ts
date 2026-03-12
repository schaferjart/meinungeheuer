/**
 * usePortraitCapture
 *
 * Two-phase portrait pipeline:
 *   Phase 1 (uploadForProcessing): Capture frame → POST to POS server →
 *     server starts style transfer in background → returns job_id immediately.
 *   Phase 2 (finalizePortrait): Send job_id + conversation duration →
 *     server applies duration-based width crop → prints.
 *
 * Key constraints:
 * - Uses Canvas drawImage + toBlob (ImageCapture API NOT supported on Safari).
 * - NEVER calls getUserMedia — reuses the single stream via the shared videoRef
 *   (iOS Safari mutes the first stream if a second getUserMedia() is called).
 * - Both phases are fire-and-forget; errors are logged but never thrown.
 */

import { useCallback, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UsePortraitCaptureOptions {
  /** Shared ref to the hidden <video> element (same one used by face detection). */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** POS server base URL, e.g. "http://192.168.1.50:9100". Empty = disabled. */
  posServerUrl: string;
}

export interface UsePortraitCaptureReturn {
  /** Capture a single JPEG frame from the video. Returns null if video is not ready. */
  captureFrame: () => Promise<Blob | null>;
  /** Phase 1: Upload photo for background processing. Returns job_id or null on failure. */
  uploadForProcessing: (blob: Blob) => Promise<string | null>;
  /** Phase 2: Send duration to trigger crop + print. Fire-and-forget. */
  finalizePortrait: (jobId: string, durationSeconds: number) => Promise<void>;
  /** True while an upload or finalize is in progress. */
  isProcessing: boolean;
  /** Last error message, or null. Cleared on next successful operation. */
  lastError: string | null;
}

// ---------------------------------------------------------------------------
// Minimum blob size (bytes). Blobs smaller than this are almost certainly
// black frames produced by a Canvas drawImage on an unready video surface.
// ---------------------------------------------------------------------------
const MIN_BLOB_SIZE = 1024;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePortraitCapture({
  videoRef,
  posServerUrl,
}: UsePortraitCaptureOptions): UsePortraitCaptureReturn {
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const baseUrl = posServerUrl.replace(/\/+$/, '');

  // -----------------------------------------------------------------------
  // captureFrame — draw the current video frame to an offscreen canvas
  // -----------------------------------------------------------------------
  const captureFrame = useCallback(async (): Promise<Blob | null> => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0) {
      console.warn('[Portrait] Video not ready for capture');
      return null;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0);

    return new Promise<Blob | null>((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (blob && blob.size > MIN_BLOB_SIZE) {
            resolve(blob);
          } else {
            console.warn('[Portrait] Captured blob too small, likely black frame');
            resolve(null);
          }
        },
        'image/jpeg',
        0.92,
      );
    });
  }, [videoRef]);

  // -----------------------------------------------------------------------
  // Phase 1: Upload photo for background processing (style transfer)
  // Returns job_id on success, null on failure. Never throws.
  // -----------------------------------------------------------------------
  const uploadForProcessing = useCallback(
    async (blob: Blob): Promise<string | null> => {
      if (!baseUrl) {
        console.warn('[Portrait] No POS server URL configured, skipping upload');
        return null;
      }

      setIsProcessing(true);
      setLastError(null);

      try {
        const formData = new FormData();
        formData.append('file', blob, 'portrait.jpg');
        formData.append('skip_selection', 'true');

        const res = await fetch(`${baseUrl}/portrait/capture`, {
          method: 'POST',
          body: formData,
          signal: AbortSignal.timeout(30_000), // 30s — just the upload, not processing
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`Upload failed ${res.status}: ${text}`);
        }

        const data = (await res.json()) as { status: string; job_id: string };
        console.log('[Portrait] Phase 1 complete — job_id:', data.job_id);
        return data.job_id;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[Portrait] Upload error:', msg);
        setLastError(msg);
        return null;
      } finally {
        setIsProcessing(false);
      }
    },
    [baseUrl],
  );

  // -----------------------------------------------------------------------
  // Phase 2: Finalize — send duration, server crops and prints
  // Fire-and-forget. Never throws.
  // -----------------------------------------------------------------------
  const finalizePortrait = useCallback(
    async (jobId: string, durationSeconds: number): Promise<void> => {
      if (!baseUrl) return;

      setIsProcessing(true);
      setLastError(null);

      try {
        const res = await fetch(`${baseUrl}/portrait/finalize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            job_id: jobId,
            duration_seconds: durationSeconds,
          }),
          // 5 min timeout — may need to wait for style transfer to finish
          signal: AbortSignal.timeout(300_000),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`Finalize failed ${res.status}: ${text}`);
        }

        const data = (await res.json()) as { status: string; width_percent: number };
        console.log(
          `[Portrait] Phase 2 complete — ${durationSeconds}s → ${data.width_percent}% width`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[Portrait] Finalize error:', msg);
        setLastError(msg);
      } finally {
        setIsProcessing(false);
      }
    },
    [baseUrl],
  );

  return { captureFrame, uploadForProcessing, finalizePortrait, isProcessing, lastError };
}
