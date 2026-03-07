import { useCallback, useEffect, useRef, useState } from 'react';
import type { TtsStatus, WordTimestamp } from '../types.js';
import { useAudioSync } from './useAudioSync.js';

// ============================================================
// Types
// ============================================================

export interface UseKaraokeReaderParams {
  /** Sorted word-level timestamps (by startTime). */
  timestamps: WordTimestamp[];
  /** Audio source — a URL string (creates Audio internally) or an existing HTMLAudioElement. */
  audioSrc?: string | HTMLAudioElement;
  /** Whether to attempt auto-play when audio is ready. */
  autoPlay?: boolean;
  /** Initial volume (0.0 – 1.0, default 1). */
  initialVolume?: number;
  /** Fires exactly once when playback finishes (audio "ended" event). */
  onComplete?: () => void;
  /** Fires on every status transition. */
  onStatusChange?: (status: TtsStatus) => void;
  /** Fires when an error occurs. */
  onError?: (error: Error) => void;
}

export interface UseKaraokeReaderReturn {
  /** Current playback status. */
  status: TtsStatus;
  /** Index of the currently active word, or -1 if none. */
  activeWordIndex: number;
  /** Start or resume playback. */
  play: () => void;
  /** Pause playback. */
  pause: () => void;
  /** Toggle between playing and paused. */
  toggle: () => void;
  /** Current volume (0.0 – 1.0). */
  volume: number;
  /** Set the audio volume (0.0 – 1.0). */
  setVolume: (v: number) => void;
  /** Error object if status is 'error'. */
  error: Error | null;
  /** Ref to the underlying HTMLAudioElement (null when no audioSrc). */
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

// ============================================================
// Hook
// ============================================================

/**
 * Orchestrator hook for karaoke playback. Composes `useAudioSync` with audio
 * lifecycle management, a status state machine, volume control, play/pause/toggle
 * controls, autoplay-blocked detection, and lifecycle callbacks.
 *
 * Status state machine:
 *   idle  ->  loading  ->  ready  ->  playing  <->  paused
 *                                       |
 *                                       v
 *                                      done
 *   (any state)  ->  error
 */
export function useKaraokeReader(params: UseKaraokeReaderParams): UseKaraokeReaderReturn {
  const {
    timestamps,
    audioSrc,
    autoPlay = false,
    initialVolume = 1,
    onComplete,
    onStatusChange,
    onError,
  } = params;

  // ---------------------------------------------------------------
  // State
  // ---------------------------------------------------------------
  const [status, setStatus] = useState<TtsStatus>('idle');
  const [volume, setVolumeState] = useState(initialVolume);
  const [error, setError] = useState<Error | null>(null);

  // Refs for stable callback references and cleanup
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ownedAudioRef = useRef(false); // true when we created the Audio element
  const onCompleteRef = useRef(onComplete);
  const onStatusChangeRef = useRef(onStatusChange);
  const onErrorRef = useRef(onError);
  const statusRef = useRef(status);

  // Keep callback refs up to date
  onCompleteRef.current = onComplete;
  onStatusChangeRef.current = onStatusChange;
  onErrorRef.current = onError;
  statusRef.current = status;

  // ---------------------------------------------------------------
  // Status setter with callback dispatch
  // ---------------------------------------------------------------
  const transitionTo = useCallback((next: TtsStatus) => {
    setStatus((prev) => {
      if (prev === next) return prev;
      return next;
    });
  }, []);

  // Fire onStatusChange whenever status changes
  useEffect(() => {
    onStatusChangeRef.current?.(status);
  }, [status]);

  // ---------------------------------------------------------------
  // Audio element lifecycle — create / wrap / cleanup
  // ---------------------------------------------------------------
  useEffect(() => {
    // Determine audio element
    let audio: HTMLAudioElement | null = null;
    let owned = false;

    if (!audioSrc) {
      // No source — idle
      audioRef.current = null;
      ownedAudioRef.current = false;
      transitionTo('idle');
      return;
    }

    if (typeof audioSrc === 'string') {
      audio = new Audio(audioSrc);
      audio.preload = 'auto';
      owned = true;
    } else {
      audio = audioSrc;
      owned = false;
    }

    audioRef.current = audio;
    ownedAudioRef.current = owned;

    // Apply initial volume
    audio.volume = volume;

    // Transition to loading
    transitionTo('loading');

    // ---------------------------------------------------------------
    // Audio event handlers
    // ---------------------------------------------------------------
    const handleCanPlayThrough = () => {
      transitionTo('ready');
    };

    const handleEnded = () => {
      transitionTo('done');
      onCompleteRef.current?.();
    };

    const handleError = () => {
      const err = new Error('Audio playback error');
      setError(err);
      transitionTo('error');
      onErrorRef.current?.(err);
    };

    audio.addEventListener('canplaythrough', handleCanPlayThrough);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    // If the audio element already has data (e.g., consumer-managed element)
    if (audio.readyState >= 4) {
      transitionTo('ready');
    }

    // Cleanup
    return () => {
      audio.removeEventListener('canplaythrough', handleCanPlayThrough);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);

      audio.pause();

      if (owned) {
        audio.src = '';
      }

      audioRef.current = null;
      ownedAudioRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioSrc, transitionTo]);

  // ---------------------------------------------------------------
  // Autoplay
  // ---------------------------------------------------------------
  useEffect(() => {
    if (!autoPlay || status !== 'ready') return;
    const audio = audioRef.current;
    if (!audio) return;

    audio.play().then(
      () => {
        transitionTo('playing');
      },
      (err: unknown) => {
        // Autoplay blocked (NotAllowedError) — stay in ready, do NOT error
        if (err instanceof DOMException && err.name === 'NotAllowedError') {
          // Silently stay in ready
          return;
        }
        // Other errors — transition to error
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        transitionTo('error');
        onErrorRef.current?.(error);
      },
    );
  }, [autoPlay, status, transitionTo]);

  // ---------------------------------------------------------------
  // Volume sync
  // ---------------------------------------------------------------
  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolumeState(clamped);
    if (audioRef.current) {
      audioRef.current.volume = clamped;
    }
  }, []);

  // ---------------------------------------------------------------
  // Play / pause / toggle
  // ---------------------------------------------------------------
  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const currentStatus = statusRef.current;
    if (currentStatus !== 'ready' && currentStatus !== 'paused') return;

    audio.play().then(
      () => {
        transitionTo('playing');
      },
      (err: unknown) => {
        if (err instanceof DOMException && err.name === 'NotAllowedError') {
          return; // Stay in current state
        }
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        transitionTo('error');
        onErrorRef.current?.(error);
      },
    );
  }, [transitionTo]);

  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const currentStatus = statusRef.current;
    if (currentStatus !== 'playing') return;

    audio.pause();
    transitionTo('paused');
  }, [transitionTo]);

  const toggle = useCallback(() => {
    const currentStatus = statusRef.current;
    if (currentStatus === 'playing') {
      pause();
    } else if (currentStatus === 'paused' || currentStatus === 'ready') {
      play();
    }
  }, [play, pause]);

  // ---------------------------------------------------------------
  // Compose useAudioSync
  // ---------------------------------------------------------------
  const { activeWordIndex } = useAudioSync({
    audio: audioRef.current,
    timestamps,
    enabled: status === 'playing',
  });

  return {
    status,
    activeWordIndex,
    play,
    pause,
    toggle,
    volume,
    setVolume,
    error,
    audioRef,
  };
}
