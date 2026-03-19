/**
 * useAudioCapture
 *
 * Records the visitor's microphone audio independently from the ElevenLabs
 * conversation WebSocket. This gives us clean visitor-only audio for voice
 * cloning downstream.
 *
 * Key constraints:
 * - Uses a separate getUserMedia({ audio: true }) call — does NOT touch the
 *   shared video stream used by face detection (different device tracks).
 * - MediaRecorder chunks collected every 1000ms, combined on stop.
 * - MIME: audio/webm;codecs=opus → audio/mp4 fallback for Safari.
 * - Never throws — all errors are logged and return null gracefully.
 * - Cleans up all tracks on unmount.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseAudioCaptureReturn {
  /** Start recording from the microphone. */
  startRecording: () => Promise<void>;
  /** Stop recording and return the combined audio blob. Returns null on error. */
  stopRecording: () => Promise<Blob | null>;
  /** Whether a recording session is currently active. */
  isRecording: boolean;
}

// ---------------------------------------------------------------------------
// MIME type selection — prefer opus/webm, fall back to mp4 for Safari
// ---------------------------------------------------------------------------

function selectMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  // Empty string → browser picks a default (last resort)
  return '';
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAudioCapture(): UseAudioCaptureReturn {
  const [isRecording, setIsRecording] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  // Resolve function for the stopRecording Promise, set when we start recording
  const stopResolveRef = useRef<((blob: Blob | null) => void) | null>(null);
  const mountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try {
          recorderRef.current.stop();
        } catch {
          // Ignore — we're unmounting
        }
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  // -----------------------------------------------------------------------
  // startRecording
  // -----------------------------------------------------------------------
  const startRecording = useCallback(async (): Promise<void> => {
    if (isRecording) {
      console.warn('[AudioCapture] Already recording, ignoring startRecording call');
      return;
    }

    // Stop and clean up any previous stream
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100,
          channelCount: 1,
        },
      });
    } catch (err) {
      console.warn('[AudioCapture] getUserMedia failed:', err);
      return;
    }

    if (!mountedRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    streamRef.current = stream;

    const mimeType = selectMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
    } catch (err) {
      console.warn('[AudioCapture] MediaRecorder init failed:', err);
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      return;
    }

    chunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      const chunks = chunksRef.current;
      const resolve = stopResolveRef.current;

      if (resolve) {
        if (chunks.length > 0) {
          const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
          console.log('[AudioCapture] Recording stopped, blob size:', blob.size, 'bytes, type:', blob.type);
          resolve(blob);
        } else {
          console.warn('[AudioCapture] No chunks collected, returning null');
          resolve(null);
        }
        stopResolveRef.current = null;
      }

      if (mountedRef.current) {
        setIsRecording(false);
      }

      // Release the microphone stream
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };

    recorder.onerror = (event) => {
      console.warn('[AudioCapture] MediaRecorder error:', event);
      stopResolveRef.current?.(null);
      stopResolveRef.current = null;
      if (mountedRef.current) {
        setIsRecording(false);
      }
    };

    recorderRef.current = recorder;
    // Collect chunks every second so we always have data even if stop() is abrupt
    recorder.start(1000);

    if (mountedRef.current) {
      setIsRecording(true);
    }

    console.log('[AudioCapture] Recording started, mimeType:', recorder.mimeType);
  }, [isRecording]);

  // -----------------------------------------------------------------------
  // stopRecording
  // -----------------------------------------------------------------------
  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    const recorder = recorderRef.current;

    if (!recorder || recorder.state === 'inactive') {
      console.warn('[AudioCapture] stopRecording called but not recording');
      return null;
    }

    return new Promise<Blob | null>((resolve) => {
      stopResolveRef.current = resolve;
      try {
        // Request any buffered data before stopping
        recorder.requestData();
        recorder.stop();
      } catch (err) {
        console.warn('[AudioCapture] recorder.stop() failed:', err);
        stopResolveRef.current = null;
        resolve(null);
      }
    });
  }, []);

  return { startRecording, stopRecording, isRecording };
}
