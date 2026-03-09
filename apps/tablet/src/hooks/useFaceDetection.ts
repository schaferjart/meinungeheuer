import { useEffect, useRef, useState, useCallback } from 'react';
import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';
import { FACE_DETECTION } from '@meinungeheuer/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FaceDetectionState {
  /** Raw — is a face visible right now? */
  isPresent: boolean;
  /** Debounced — has a face been present for WAKE_THRESHOLD_MS? */
  isAwake: boolean;
  /** Debounced — has no face been present for SLEEP_THRESHOLD_MS? */
  isSleeping: boolean;
  /** Camera/model init error message, or null */
  error: string | null;
  /** True once camera stream + model are both ready */
  cameraReady: boolean;
}

export interface UseFaceDetectionOptions {
  /** Called once when debounced wake condition is first met */
  onWake?: () => void;
  /** Called once when debounced sleep condition is first met */
  onSleep?: () => void;
  /** Ref to the hidden <video> element that receives the camera stream */
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

// ---------------------------------------------------------------------------
// CDN base used to load the WASM runtime and the model
// The version must match the installed @mediapipe/tasks-vision package.
// ---------------------------------------------------------------------------
const MEDIAPIPE_CDN =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm';

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useFaceDetection({
  onWake,
  onSleep,
  videoRef,
}: UseFaceDetectionOptions): FaceDetectionState {
  const [isPresent, setIsPresent] = useState(false);
  const [isAwake, setIsAwake] = useState(false);
  const [isSleeping, setIsSleeping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

  // Stable refs for callbacks — avoids stale closure issues in the interval
  const onWakeRef = useRef(onWake);
  const onSleepRef = useRef(onSleep);
  useEffect(() => { onWakeRef.current = onWake; }, [onWake]);
  useEffect(() => { onSleepRef.current = onSleep; }, [onSleep]);

  // Internal debounce trackers
  const presenceSinceRef = useRef<number | null>(null);   // time face first detected
  const absenceSinceRef = useRef<number | null>(null);    // time face first lost
  const wakeEmittedRef = useRef(false);
  const sleepEmittedRef = useRef(false);

  // Detector + stream teardown references
  const detectorRef = useRef<FaceDetector | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  // Reset debounce state whenever the external caller resets isAwake/isSleeping
  const resetDebounce = useCallback(() => {
    presenceSinceRef.current = null;
    absenceSinceRef.current = null;
    wakeEmittedRef.current = false;
    sleepEmittedRef.current = false;
  }, []);
  void resetDebounce; // available for future use

  useEffect(() => {
    mountedRef.current = true;

    async function init() {
      // 1. Request camera — front-facing, high resolution for portrait capture.
      //    MediaPipe internally downscales, so higher input adds negligible CPU.
      //    Using `ideal` (not `exact`) so iOS Safari returns the closest available.
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 960 },
          },
          audio: false,
        });
      } catch (err) {
        if (!mountedRef.current) return;
        const msg =
          err instanceof Error ? err.message : 'Camera permission denied';
        setError(`Camera unavailable: ${msg}`);
        return;
      }

      if (!mountedRef.current) {
        // Component unmounted while awaiting permission
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;

      // Attach to the hidden video element
      const video = videoRef.current;
      if (!video) {
        setError('Video element not available');
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      video.srcObject = stream;

      // Wait for the video to be playable
      await new Promise<void>((resolve) => {
        video.onloadedmetadata = () => {
          void video.play().then(resolve).catch(resolve);
        };
      });

      console.log('[FaceDetection] Camera resolution:', video.videoWidth, 'x', video.videoHeight);

      if (!mountedRef.current) return;

      // 2. Initialise MediaPipe FaceDetector
      let detector: FaceDetector;
      try {
        const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_CDN);
        detector = await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          minDetectionConfidence: FACE_DETECTION.MIN_CONFIDENCE,
        });
      } catch (err) {
        if (!mountedRef.current) return;
        const msg = err instanceof Error ? err.message : 'Model load failed';
        setError(`Face detector init failed: ${msg}`);
        return;
      }

      if (!mountedRef.current) {
        detector.close();
        return;
      }

      detectorRef.current = detector;

      if (mountedRef.current) {
        setCameraReady(true);
      }

      // 3. Detection loop at 2 fps (every 500 ms)
      intervalRef.current = setInterval(() => {
        if (!mountedRef.current) return;
        if (!video || video.readyState < 2) return; // HAVE_CURRENT_DATA

        const now = performance.now();

        let detected = false;
        try {
          const result = detector.detectForVideo(video, now);
          detected = result.detections.length > 0;
        } catch {
          // Silently ignore per-frame errors (video may not yet have a frame)
          return;
        }

        setIsPresent(detected);

        const wallNow = Date.now();

        if (detected) {
          // Face is present — reset absence tracking
          absenceSinceRef.current = null;
          sleepEmittedRef.current = false;

          if (presenceSinceRef.current === null) {
            presenceSinceRef.current = wallNow;
          }

          const presenceDuration = wallNow - presenceSinceRef.current;
          if (
            presenceDuration >= FACE_DETECTION.WAKE_THRESHOLD_MS &&
            !wakeEmittedRef.current
          ) {
            wakeEmittedRef.current = true;
            setIsAwake(true);
            onWakeRef.current?.();
          }
        } else {
          // No face — reset presence tracking
          presenceSinceRef.current = null;
          wakeEmittedRef.current = false;

          if (absenceSinceRef.current === null) {
            absenceSinceRef.current = wallNow;
          }

          const absenceDuration = wallNow - absenceSinceRef.current;
          if (
            absenceDuration >= FACE_DETECTION.SLEEP_THRESHOLD_MS &&
            !sleepEmittedRef.current
          ) {
            sleepEmittedRef.current = true;
            setIsAwake(false);
            setIsSleeping(true);
            onSleepRef.current?.();
          }
        }
      }, FACE_DETECTION.DETECTION_INTERVAL_MS);
    }

    void init();

    return () => {
      mountedRef.current = false;

      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      detectorRef.current?.close();
      detectorRef.current = null;

      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  // videoRef is a ref — its .current can change but the ref object is stable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { isPresent, isAwake, isSleeping, error, cameraReady };
}
