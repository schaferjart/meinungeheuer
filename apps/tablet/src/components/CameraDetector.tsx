/**
 * CameraDetector
 *
 * A renderless component that:
 *  1. Maintains a hidden <video> element receiving the front-facing camera stream.
 *  2. Runs MediaPipe face detection at 2 fps.
 *  3. Calls onWake / onSleep once the debounced thresholds are crossed.
 *
 * The camera feed is NEVER shown to the visitor.
 * If camera permission is denied, the component logs a warning and renders nothing —
 * the visitor can still tap the SleepScreen to trigger WAKE manually.
 */

import { useRef } from 'react';
import { useFaceDetection } from '../hooks/useFaceDetection';

interface CameraDetectorProps {
  onWake: () => void;
  onSleep: () => void;
}

export function CameraDetector({ onWake, onSleep }: CameraDetectorProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const { error, cameraReady } = useFaceDetection({
    videoRef,
    onWake,
    onSleep,
  });

  // Log errors once in dev but don't crash — tap-to-start on SleepScreen is the fallback
  if (error && !cameraReady) {
    console.warn('[CameraDetector]', error);
  }

  return (
    // This video element is completely invisible — zero dimensions, no pointer events.
    // MediaPipe reads frames from it via detectForVideo().
    <video
      ref={videoRef}
      style={{
        position: 'fixed',
        width: 0,
        height: 0,
        opacity: 0,
        pointerEvents: 'none',
        // Keep it off-screen rather than display:none so MediaPipe can still read frames
        top: -9999,
        left: -9999,
      }}
      muted
      playsInline
      aria-hidden="true"
    />
  );
}
