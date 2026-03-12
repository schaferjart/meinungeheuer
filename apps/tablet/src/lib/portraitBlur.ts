/**
 * portraitBlur
 *
 * Captures a blurred portrait from a shared <video> element.
 *
 * Two-canvas approach:
 *   1. Draw the raw video frame onto canvas A (no filter).
 *   2. Set ctx.filter = blur(...) on canvas B, then drawImage(canvas A) onto B.
 *      The filter is applied at draw-time, so canvas B holds the blurred pixels.
 *   3. Export canvas B as JPEG blob.
 *
 * This is necessary because ctx.filter only affects subsequent draw calls —
 * setting it after drawing has no effect. CSS filter on the canvas element
 * itself is not captured by toBlob(), so this two-canvas approach is the
 * correct cross-browser technique.
 *
 * Key constraints:
 * - NEVER calls getUserMedia — reads from the shared video ref only.
 * - Returns null if video is not ready or blob is suspiciously small.
 * - Never throws.
 */

import type { RefObject } from 'react';

// Blobs below this size are almost certainly a black frame from an unready video.
const MIN_BLOB_SIZE = 1024;

/**
 * Capture a blurred JPEG from the video element referenced by videoRef.
 *
 * @param videoRef - Ref to the shared hidden <video> element.
 * @param blurRadius - CSS blur radius in pixels (default: 25).
 * @returns A JPEG Blob, or null if the video is not ready or capture fails.
 */
export async function captureBlurredPortrait(
  videoRef: RefObject<HTMLVideoElement | null>,
  blurRadius = 25,
): Promise<Blob | null> {
  try {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0) {
      console.warn('[PortraitBlur] Video not ready for capture');
      return null;
    }

    const { videoWidth: w, videoHeight: h } = video;

    // Canvas A: raw unfiltered frame
    const canvasA = document.createElement('canvas');
    canvasA.width = w;
    canvasA.height = h;
    const ctxA = canvasA.getContext('2d');
    if (!ctxA) {
      console.warn('[PortraitBlur] Could not get 2d context for canvas A');
      return null;
    }
    ctxA.drawImage(video, 0, 0);

    // Canvas B: receives the blurred version
    const canvasB = document.createElement('canvas');
    canvasB.width = w;
    canvasB.height = h;
    const ctxB = canvasB.getContext('2d');
    if (!ctxB) {
      console.warn('[PortraitBlur] Could not get 2d context for canvas B');
      return null;
    }

    // Apply blur filter BEFORE the draw call
    ctxB.filter = `blur(${blurRadius}px)`;
    // Draw canvas A (with raw frame) into canvas B — filter applied at draw time
    ctxB.drawImage(canvasA, 0, 0);

    return new Promise<Blob | null>((resolve) => {
      canvasB.toBlob(
        (blob) => {
          if (blob && blob.size > MIN_BLOB_SIZE) {
            console.log('[PortraitBlur] Blurred portrait captured:', blob.size, 'bytes');
            resolve(blob);
          } else {
            console.warn('[PortraitBlur] Blob too small, likely black frame');
            resolve(null);
          }
        },
        'image/jpeg',
        0.85,
      );
    });
  } catch (err) {
    console.warn('[PortraitBlur] Capture error:', err);
    return null;
  }
}
