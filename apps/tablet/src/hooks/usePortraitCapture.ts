/**
 * usePortraitCapture
 *
 * Captures a still frame from a shared <video> element (same stream used by
 * face detection) and uploads it to the cloud print-renderer's
 * /process/portrait endpoint.
 *
 * Key constraints:
 * - Uses Canvas drawImage + toBlob (ImageCapture API is NOT supported on Safari).
 * - NEVER calls getUserMedia — reuses the single stream via the shared videoRef
 *   (iOS Safari mutes the first stream if a second getUserMedia() is called).
 * - Upload is fire-and-forget; the print-renderer's pipeline runs asynchronously
 *   (style transfer + face detection + dithering). We must never block UI transitions.
 */

import { useCallback, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UsePortraitCaptureOptions {
  /** Shared ref to the hidden <video> element (same one used by face detection). */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Print renderer base URL, e.g. "https://renderer.example.com". Empty = disabled. */
  printRendererUrl: string;
  /** Optional session ID to associate portrait prints with. */
  sessionId?: string | null;
}

export interface UsePortraitCaptureReturn {
  /** Capture a single JPEG frame from the video. Returns null if video is not ready. */
  captureFrame: () => Promise<Blob | null>;
  /** Upload a previously captured blob to the POS server. Fire-and-forget. */
  uploadPortrait: (blob: Blob) => Promise<void>;
  /** Convenience: capture a frame then upload it. Never throws. */
  captureAndUpload: () => Promise<void>;
  /** True while an upload is in progress. */
  isCapturing: boolean;
  /** Last error message from upload, or null. Cleared on next successful upload. */
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
  printRendererUrl,
  sessionId,
}: UsePortraitCaptureOptions): UsePortraitCaptureReturn {
  const [isCapturing, setIsCapturing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

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
  // uploadPortrait — POST blob to cloud print-renderer /process/portrait
  // -----------------------------------------------------------------------
  const uploadPortrait = useCallback(
    async (blob: Blob): Promise<void> => {
      if (!printRendererUrl) {
        console.warn('[Portrait] No print renderer URL configured, skipping upload');
        return;
      }

      setIsCapturing(true);
      setLastError(null);

      try {
        const formData = new FormData();
        formData.append('file', blob, 'portrait.jpg');
        formData.append('skip_selection', 'true');
        if (sessionId) {
          formData.append('session_id', sessionId);
        }

        const url = `${printRendererUrl.replace(/\/+$/, '')}/process/portrait`;

        const res = await fetch(url, {
          method: 'POST',
          body: formData,
          // 5 min timeout: style transfer + face detection in cloud
          signal: AbortSignal.timeout(300_000),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`Portrait upload failed ${res.status}: ${text}`);
        }

        console.log('[Portrait] Upload to print-renderer successful');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[Portrait] Upload error:', msg);
        setLastError(msg);
      } finally {
        setIsCapturing(false);
      }
    },
    [printRendererUrl, sessionId],
  );

  // -----------------------------------------------------------------------
  // captureAndUpload — convenience combo. Never throws.
  // -----------------------------------------------------------------------
  const captureAndUpload = useCallback(async (): Promise<void> => {
    const blob = await captureFrame();
    if (blob) {
      await uploadPortrait(blob);
    }
  }, [captureFrame, uploadPortrait]);

  return { captureFrame, uploadPortrait, captureAndUpload, isCapturing, lastError };
}
