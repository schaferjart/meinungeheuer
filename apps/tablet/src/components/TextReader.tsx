import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KaraokeReader, stripMarkdownForTTS } from 'karaoke-reader';
import { useElevenLabsTTS } from 'karaoke-reader/elevenlabs';
import type { TtsStatus } from 'karaoke-reader';
import 'karaoke-reader/styles.css';
import { createSupabaseTTSCache } from '../lib/supabaseCacheAdapter';

// ============================================================
// Types
// ============================================================

export interface TextReaderProps {
  text: string;
  voiceId: string;
  apiKey: string;
  language: 'de' | 'en';
  onComplete: () => void;
}

// ============================================================
// Voice settings (MeinUngeheuer-specific)
// ============================================================

const VOICE_SETTINGS = {
  stability: 0.35,
  similarity_boost: 0.65,
  style: 0.6,
  use_speaker_boost: true,
} as const;

// ============================================================
// Combined status type
// ============================================================

type CombinedStatus = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'done' | 'error';

// ============================================================
// Singleton cache adapter (created once)
// ============================================================

let cacheAdapter: ReturnType<typeof createSupabaseTTSCache> | null = null;
function getCacheAdapter() {
  if (!cacheAdapter) {
    cacheAdapter = createSupabaseTTSCache();
  }
  return cacheAdapter;
}

// ============================================================
// Component
// ============================================================

export function TextReader({ text, voiceId, apiKey, language, onComplete }: TextReaderProps) {
  // Strip markdown for TTS so it doesn't speak "#" or "~~"
  const ttsText = useMemo(() => stripMarkdownForTTS(text), [text]);

  // Build TTS options — null when params are missing (hook stays idle)
  const ttsOptions = useMemo(() => {
    if (!ttsText || !voiceId || !apiKey) return null;
    return {
      apiKey,
      voiceId,
      text: ttsText,
      voiceSettings: VOICE_SETTINGS,
      cache: getCacheAdapter(),
    };
  }, [ttsText, voiceId, apiKey]);

  // Fetch TTS data via karaoke-reader's ElevenLabs adapter
  const { status: ttsStatus, result: ttsResult, error: ttsError } = useElevenLabsTTS(ttsOptions);

  // Track playback status from KaraokeReader
  const [playbackStatus, setPlaybackStatus] = useState<TtsStatus>('idle');

  // Track play/pause from KaraokeReader's internal hook
  const karaokeRef = useRef<{ play: () => void; pause: () => void } | null>(null);

  // -----------------------------------------------------------------------
  // Combined status: TTS fetch phase → playback phase
  // -----------------------------------------------------------------------
  const combinedStatus: CombinedStatus = useMemo(() => {
    if (ttsStatus === 'error') return 'error';
    if (ttsStatus === 'idle' || ttsStatus === 'loading') return 'loading';
    // ttsStatus is 'ready' — use playback status from KaraokeReader
    if (playbackStatus === 'playing') return 'playing';
    if (playbackStatus === 'paused') return 'paused';
    if (playbackStatus === 'done') return 'done';
    if (playbackStatus === 'error') return 'error';
    return 'ready';
  }, [ttsStatus, playbackStatus]);

  // -----------------------------------------------------------------------
  // KaraokeReader status change handler
  // -----------------------------------------------------------------------
  const handleStatusChange = useCallback((status: TtsStatus) => {
    setPlaybackStatus(status);
  }, []);

  // -----------------------------------------------------------------------
  // i18n strings
  // -----------------------------------------------------------------------
  const i18n = useMemo(() => ({
    loading: language === 'de' ? 'Wird vorbereitet...' : 'Preparing...',
    pause: language === 'de' ? 'Angehalten' : 'Paused',
    continue: language === 'de' ? 'Weiter' : 'Continue',
    skip: language === 'de' ? 'Uberspringen' : 'Skip',
    ready: language === 'de' ? 'Bereit?' : 'Ready?',
    readAtOwnPace:
      language === 'de'
        ? 'Lesen Sie in Ihrem Tempo'
        : 'Read at your own pace',
    tapToPause: language === 'de' ? 'Tippen zum Pausieren' : 'Tap to pause',
  }), [language]);

  // -----------------------------------------------------------------------
  // Render helpers
  // -----------------------------------------------------------------------
  const isLoading = combinedStatus === 'loading';
  const isPlaying = combinedStatus === 'playing';
  const isPaused = combinedStatus === 'paused';
  const isDone = combinedStatus === 'done';
  const isError = combinedStatus === 'error';
  const isReady = combinedStatus === 'ready';

  // -----------------------------------------------------------------------
  // Auto-continue after text finishes reading (2s delay)
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (combinedStatus !== 'done') return;
    const timer = setTimeout(() => {
      onComplete();
    }, 2000);
    return () => clearTimeout(timer);
  }, [combinedStatus, onComplete]);

  // -----------------------------------------------------------------------
  // We need play/pause controls for the wrapper buttons.
  // KaraokeReader with hideControls still handles click-to-toggle internally.
  // For explicit buttons, we use the ref-based approach:
  // We store the current playback status and use a hidden audio element trick.
  // Actually, since KaraokeReader handles toggle on click internally,
  // the wrapper buttons need to interact with the same audio element.
  // We'll use the audioUrl from ttsResult and manage it via the ref.
  // -----------------------------------------------------------------------

  // We need a way to control play/pause from wrapper buttons.
  // The audio element is created by KaraokeReader internally.
  // But we can pass an HTMLAudioElement via audioSrc instead of a URL string.
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Create/update audio element when ttsResult changes
  useEffect(() => {
    if (!ttsResult) {
      audioRef.current = null;
      return;
    }

    const audio = new Audio(ttsResult.audioUrl);
    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.src = '';
      // The blob URL is revoked by useElevenLabsTTS cleanup
    };
  }, [ttsResult]);

  // Play/pause handlers using the audio element
  const handlePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.play().catch((err: unknown) => {
      console.error('[TextReader] Playback error:', err);
    });
  }, []);

  const handlePause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
  }, []);

  return (
    <div className="flex flex-col w-full h-full bg-black">
      {/* KaraokeReader with text + highlighting */}
      {ttsResult && audioRef.current && (
        <KaraokeReader
          text={text}
          timestamps={ttsResult.timestamps}
          audioSrc={audioRef.current}
          autoPlay
          onStatusChange={handleStatusChange}
          hideControls
          className="flex-1"
          style={{
            '--kr-bg': 'transparent',
            '--kr-color': '#ffffff',
            '--kr-highlight': '#fcd34d',
            '--kr-spoken-opacity': '0.4',
            '--kr-upcoming-opacity': '0.9',
            '--kr-font-family': "Georgia, 'Times New Roman', serif",
            '--kr-font-size': 'clamp(1.2rem, 3vw, 1.8rem)',
            '--kr-line-height': '1.8',
            '--kr-letter-spacing': '0.02em',
            '--kr-content-max-width': '700px',
            '--kr-padding': 'clamp(2rem, 6vw, 4rem) clamp(2rem, 8vw, 6rem)',
          } as React.CSSProperties}
        />
      )}

      {/* Loading indicator — show when TTS is idle/loading OR KaraokeReader not yet rendered */}
      {isLoading && (
        <div className="flex-1 flex items-end justify-center">
          <div
            className="flex justify-center pb-8"
            style={{ animation: 'pulse 2s ease-in-out infinite' }}
          >
            <LoadingDots />
          </div>
        </div>
      )}

      {/* Error fallback */}
      {isError && (
        <div className="flex flex-col items-center gap-4 pb-8">
          <p
            className="text-white/50"
            style={{
              fontFamily: 'system-ui, sans-serif',
              fontSize: 'clamp(0.8rem, 1.5vw, 1rem)',
            }}
          >
            {i18n.readAtOwnPace}
          </p>
          <ActionButton label={i18n.ready} onClick={onComplete} />
        </div>
      )}

      {/* Ready to start (TTS loaded but not yet playing) */}
      {isReady && (
        <div className="flex justify-center pb-8 animate-fade-in">
          <ActionButton label={i18n.continue} onClick={handlePlay} />
        </div>
      )}

      {/* Paused controls */}
      {isPaused && (
        <div className="flex justify-center gap-6 pb-8 animate-fade-in">
          <ActionButton label={i18n.continue} onClick={handlePlay} />
          <ActionButton label={i18n.skip} onClick={onComplete} variant="ghost" />
        </div>
      )}

      {/* Done — auto-advancing after 2s delay */}
      {isDone && (
        <div
          className="flex justify-center pb-8 animate-fade-in"
          style={{ animation: 'pulse 2s ease-in-out infinite' }}
        >
          <LoadingDots />
        </div>
      )}

      {/* Volume slider — subtle, visible during playback */}
      {(isPlaying || isPaused) && audioRef.current && (
        <VolumeSlider audioElement={audioRef.current} />
      )}

      {/* Playing — no visible controls, tap text to pause */}
      {isPlaying && (
        <div className="flex justify-center pb-4">
          <p
            className="text-white/20"
            style={{
              fontFamily: 'system-ui, sans-serif',
              fontSize: '0.7rem',
              letterSpacing: '0.1em',
            }}
          >
            {i18n.tapToPause}
          </p>
        </div>
      )}

      {/* Hide scrollbar + animation styling */}
      <style>{`
        ::-webkit-scrollbar { display: none; }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.4s ease-out forwards;
        }
        .volume-control {
          opacity: 0.15;
          transition: opacity 0.3s ease;
        }
        .volume-control:hover,
        .volume-control:active {
          opacity: 0.5;
        }
        .volume-slider {
          -webkit-appearance: none;
          appearance: none;
          height: 3px;
          border-radius: 2px;
          background: rgba(255, 255, 255, 0.2);
          outline: none;
          cursor: pointer;
        }
        .volume-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.4);
          cursor: pointer;
        }
        .volume-slider::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.4);
          cursor: pointer;
          border: none;
        }
      `}</style>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function LoadingDots() {
  return (
    <div className="flex gap-2 items-center">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-2 h-2 rounded-full bg-white/40"
          style={{
            animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

function VolumeSlider({ audioElement }: { audioElement: HTMLAudioElement }) {
  const [volume, setVolume] = useState(audioElement.volume);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    audioElement.volume = v;
  }, [audioElement]);

  return (
    <div className="flex items-center justify-center py-2 volume-control">
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={volume}
        onChange={handleChange}
        className="volume-slider"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        style={{ width: '100px' }}
      />
    </div>
  );
}

interface ActionButtonProps {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'ghost';
}

function ActionButton({ label, onClick, variant = 'default' }: ActionButtonProps) {
  const borderColor = variant === 'ghost' ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.3)';
  const textOpacity = variant === 'ghost' ? 'text-white/50' : 'text-white';

  return (
    <button
      onClick={onClick}
      className={`${textOpacity} cursor-pointer`}
      style={{
        fontFamily: 'system-ui, sans-serif',
        fontSize: 'clamp(0.9rem, 1.8vw, 1.1rem)',
        fontWeight: 400,
        backgroundColor: 'transparent',
        border: `1px solid ${borderColor}`,
        borderRadius: '2px',
        padding: '0.75rem 2.5rem',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        transition: 'border-color 0.2s ease, opacity 0.2s ease',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.8)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = borderColor;
      }}
    >
      {label}
    </button>
  );
}
