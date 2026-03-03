import { useCallback, useEffect, useRef } from 'react';
import {
  useTextToSpeechWithTimestamps,
  type TtsStatus,
} from '../hooks/useTextToSpeechWithTimestamps';

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
// CSS class names for word states (Tailwind)
// ============================================================

const WORD_CLASS_BASE = 'inline';
const WORD_CLASS_ACTIVE = 'text-amber-300';
const WORD_CLASS_SPOKEN = 'opacity-40';
const WORD_CLASS_UPCOMING = 'opacity-90';

// ============================================================
// Component
// ============================================================

export function TextReader({ text, voiceId, apiKey, language, onComplete }: TextReaderProps) {
  const { status, words, activeWordIndex, play, pause, error, volume, setVolume } = useTextToSpeechWithTimestamps({
    text,
    voiceId,
    apiKey,
    autoPlay: true,
  });

  const wordSpansRef = useRef<Map<number, HTMLSpanElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const prevActiveRef = useRef<number>(-1);
  const lastScrollTimeRef = useRef(0);
  const scrollResetTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // -----------------------------------------------------------------------
  // Direct DOM manipulation for word highlighting (perf: no re-renders)
  // -----------------------------------------------------------------------
  useEffect(() => {
    const prevIndex = prevActiveRef.current;
    const spans = wordSpansRef.current;

    // Remove active class from previous word
    if (prevIndex >= 0) {
      const prevSpan = spans.get(prevIndex);
      if (prevSpan) {
        prevSpan.classList.remove(...WORD_CLASS_ACTIVE.split(' '));
        prevSpan.classList.add(...WORD_CLASS_SPOKEN.split(' '));
      }
    }

    // Mark all words before active as spoken (in case we jumped)
    if (activeWordIndex >= 0) {
      for (let i = 0; i < activeWordIndex; i++) {
        const span = spans.get(i);
        if (span) {
          span.classList.remove(...WORD_CLASS_ACTIVE.split(' '));
          span.classList.remove(...WORD_CLASS_UPCOMING.split(' '));
          if (!span.classList.contains(WORD_CLASS_SPOKEN.split(' ')[0] ?? '')) {
            span.classList.add(...WORD_CLASS_SPOKEN.split(' '));
          }
        }
      }
    }

    // Add active class to current word
    if (activeWordIndex >= 0) {
      const activeSpan = spans.get(activeWordIndex);
      if (activeSpan) {
        activeSpan.classList.remove(...WORD_CLASS_SPOKEN.split(' '));
        activeSpan.classList.remove(...WORD_CLASS_UPCOMING.split(' '));
        activeSpan.classList.add(...WORD_CLASS_ACTIVE.split(' '));

        // Comfort-zone auto-scroll: only scroll when word leaves middle band
        const container = containerRef.current;
        if (container) {
          const now = Date.now();
          if (now - lastScrollTimeRef.current >= 2000 || lastScrollTimeRef.current === 0) {
            const rect = activeSpan.getBoundingClientRect();
            const cRect = container.getBoundingClientRect();
            const rel = (rect.top - cRect.top) / cRect.height;
            // Comfort zone: 20%–65% of viewport
            if (rel < 0.2 || rel > 0.65) {
              const target = cRect.height * 0.35;
              container.scrollBy({
                top: rect.top - cRect.top - target,
                behavior: 'smooth',
              });
            }
          }
        }
      }
    }

    prevActiveRef.current = activeWordIndex;
  }, [activeWordIndex]);

  // -----------------------------------------------------------------------
  // Manual scroll tracking — cooldown prevents scroll-fighting
  // -----------------------------------------------------------------------
  const handleContainerScroll = useCallback(() => {
    lastScrollTimeRef.current = Date.now();
    clearTimeout(scrollResetTimerRef.current);
    scrollResetTimerRef.current = setTimeout(() => {
      lastScrollTimeRef.current = 0;
    }, 4000);
  }, []);

  useEffect(() => {
    return () => {
      clearTimeout(scrollResetTimerRef.current);
    };
  }, []);

  // -----------------------------------------------------------------------
  // Ref callback for word spans
  // -----------------------------------------------------------------------
  const setWordRef = useCallback((index: number, el: HTMLSpanElement | null) => {
    if (el) {
      wordSpansRef.current.set(index, el);
    } else {
      wordSpansRef.current.delete(index);
    }
  }, []);

  // -----------------------------------------------------------------------
  // Tap to pause/resume
  // -----------------------------------------------------------------------
  const handleTextTap = useCallback(() => {
    if (status === 'playing') {
      pause();
    } else if (status === 'paused' || status === 'ready') {
      play();
    }
  }, [status, play, pause]);

  // -----------------------------------------------------------------------
  // Render helpers
  // -----------------------------------------------------------------------
  const isLoading = status === 'loading' || status === 'idle';
  const isPlaying = status === 'playing';
  const isPaused = status === 'paused';
  const isDone = status === 'done';
  const isError = status === 'error';
  const isReady = status === 'ready';

  const i18n = {
    loading: language === 'de' ? 'Wird vorbereitet...' : 'Preparing...',
    pause: language === 'de' ? 'Angehalten' : 'Paused',
    continue: language === 'de' ? 'Weiter' : 'Continue',
    skip: language === 'de' ? 'Uberspringen' : 'Skip',
    ready: language === 'de' ? 'Bereit?' : 'Ready?',
    readAtOwnPace:
      language === 'de'
        ? 'Lesen Sie in Ihrem Tempo'
        : 'Read at your own pace',
  };

  // Split text into words for rendering (must match the word splitting in
  // buildWordTimestamps so indices line up)
  const textWords = text.split(/(\s+)/).filter(Boolean);
  let wordIdx = 0;

  return (
    <div className="flex flex-col w-full h-full bg-black">
      {/* Scrollable text area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto"
        style={{
          padding: 'clamp(2rem, 6vw, 4rem) clamp(2rem, 8vw, 6rem)',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
        onClick={handleTextTap}
        onScroll={handleContainerScroll}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            handleTextTap();
          }
        }}
      >
        <p
          className="max-w-[700px] mx-auto"
          style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: 'clamp(1.2rem, 3vw, 1.8rem)',
            lineHeight: '1.8',
            color: '#ffffff',
            margin: 0,
            letterSpacing: '0.02em',
          }}
        >
          {textWords.map((token, tokenIndex) => {
            // Whitespace tokens: render as-is
            if (/^\s+$/.test(token)) {
              return (
                <span key={`ws-${tokenIndex}`}>{token}</span>
              );
            }

            // Word token: render with ref and base classes
            const currentWordIdx = wordIdx;
            wordIdx++;

            return (
              <span
                key={`word-${currentWordIdx}`}
                data-index={currentWordIdx}
                ref={(el) => setWordRef(currentWordIdx, el)}
                className={`${WORD_CLASS_BASE} ${WORD_CLASS_UPCOMING}`}
                style={{ transition: 'color 0.2s ease, opacity 0.4s ease' }}
              >
                {token}
              </span>
            );
          })}
        </p>
      </div>

      {/* Loading indicator */}
      {isLoading && (
        <div
          className="flex justify-center pb-8"
          style={{ animation: 'pulse 2s ease-in-out infinite' }}
        >
          <LoadingDots />
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
          <ActionButton label={i18n.continue} onClick={play} />
        </div>
      )}

      {/* Paused controls */}
      {isPaused && (
        <div className="flex justify-center gap-6 pb-8 animate-fade-in">
          <ActionButton label={i18n.continue} onClick={play} />
          <ActionButton label={i18n.skip} onClick={onComplete} variant="ghost" />
        </div>
      )}

      {/* Done — ready to proceed */}
      {isDone && (
        <div className="flex justify-center pb-8 animate-fade-in">
          <ActionButton label={i18n.ready} onClick={onComplete} />
        </div>
      )}

      {/* Volume slider — subtle, visible during playback */}
      {(isPlaying || isPaused) && (
        <VolumeSlider volume={volume} onVolumeChange={setVolume} />
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
            {language === 'de' ? 'Tippen zum Pausieren' : 'Tap to pause'}
          </p>
        </div>
      )}

      {/* Hide scrollbar + volume slider styling */}
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

function VolumeSlider({ volume, onVolumeChange }: { volume: number; onVolumeChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-center py-2 volume-control">
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={volume}
        onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
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
