import { useCallback, useEffect, useMemo, useRef } from 'react';
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
// Markdown helpers
// ============================================================

/**
 * Strip markdown syntax for TTS. Produces the same word sequence
 * as the visual renderer (both skip `#` and `~~` markers).
 */
function stripMarkdownForTTS(text: string): string {
  return text
    .replace(/^#+\s*/gm, '')   // header markers
    .replace(/~~/g, '')        // strikethrough markers
    .replace(/ {2,}$/gm, ''); // trailing double-space line break markers
}

/**
 * Parse a content string into words with inline strikethrough flags.
 * Splits on `~~` to detect strikethrough regions, then splits each
 * region into whitespace-delimited words.
 */
function parseContentToWords(
  content: string,
): Array<{ word: string; strikethrough: boolean }> {
  const result: Array<{ word: string; strikethrough: boolean }> = [];
  const parts = content.split(/(~~)/);

  let inStrike = false;
  for (const part of parts) {
    if (part === '~~') {
      inStrike = !inStrike;
      continue;
    }
    const words = part.split(/\s+/).filter(Boolean);
    for (const word of words) {
      result.push({ word, strikethrough: inStrike });
    }
  }

  return result;
}

type LineType = 'header' | 'list-item' | 'text';

interface ParsedWord {
  word: string;
  strikethrough: boolean;
  globalIndex: number;
}

interface ParsedLine {
  type: LineType;
  words: ParsedWord[];
}

interface ParsedParagraph {
  lines: ParsedLine[];
}

/**
 * Parse markdown text into paragraphs → lines → words.
 * Each word gets a globally sequential index that matches
 * the word sequence produced by `stripMarkdownForTTS`.
 */
function parseMarkdownText(text: string): ParsedParagraph[] {
  const result: ParsedParagraph[] = [];
  let globalIdx = 0;

  // Split into paragraphs on blank lines (with optional whitespace)
  const rawParagraphs = text.split(/\n\s*\n/);

  for (const rawPara of rawParagraphs) {
    const rawLines = rawPara.split(/\n/).filter((l) => l.trim().length > 0);
    const lines: ParsedLine[] = [];

    for (const rawLine of rawLines) {
      // Strip trailing double-space line break markers
      const line = rawLine.replace(/ {2,}$/, '');

      // Detect line type
      const headerMatch = line.match(/^(#+)\s+(.*)/);
      if (headerMatch) {
        const contentWords = parseContentToWords(headerMatch[2]!);
        lines.push({
          type: 'header',
          words: contentWords.map((w) => ({ ...w, globalIndex: globalIdx++ })),
        });
        continue;
      }

      if (/^\d+\.\s/.test(line)) {
        const contentWords = parseContentToWords(line);
        lines.push({
          type: 'list-item',
          words: contentWords.map((w) => ({ ...w, globalIndex: globalIdx++ })),
        });
        continue;
      }

      const contentWords = parseContentToWords(line);
      lines.push({
        type: 'text',
        words: contentWords.map((w) => ({ ...w, globalIndex: globalIdx++ })),
      });
    }

    if (lines.length > 0) {
      result.push({ lines });
    }
  }

  return result;
}

// ============================================================
// Component
// ============================================================

export function TextReader({ text, voiceId, apiKey, language, onComplete }: TextReaderProps) {
  // Strip markdown for TTS so it doesn't speak "#" or "~~"
  const ttsText = useMemo(() => stripMarkdownForTTS(text), [text]);

  const { status, words, activeWordIndex, play, pause, error, volume, setVolume } = useTextToSpeechWithTimestamps({
    text: ttsText,
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

  // -----------------------------------------------------------------------
  // Auto-continue after text finishes reading (2s delay)
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (status !== 'done') return;
    const timer = setTimeout(() => {
      onComplete();
    }, 2000);
    return () => clearTimeout(timer);
  }, [status, onComplete]);

  // -----------------------------------------------------------------------
  // Parse markdown into renderable structure with global word indices.
  // -----------------------------------------------------------------------
  const paragraphs = useMemo(() => parseMarkdownText(text), [text]);

  // -----------------------------------------------------------------------
  // Render a single word span
  // -----------------------------------------------------------------------
  const renderWord = (w: ParsedWord, wIdx: number) => (
    <span key={`wg-${w.globalIndex}`}>
      {wIdx > 0 && ' '}
      <span
        data-index={w.globalIndex}
        ref={(el) => setWordRef(w.globalIndex, el)}
        className={`${WORD_CLASS_BASE} ${WORD_CLASS_UPCOMING}`}
        style={{
          transition: 'color 0.2s ease, opacity 0.4s ease',
          ...(w.strikethrough ? { textDecoration: 'line-through' } : {}),
        }}
      >
        {w.word}
      </span>
    </span>
  );

  // -----------------------------------------------------------------------
  // Base text style
  // -----------------------------------------------------------------------
  const baseStyle: React.CSSProperties = {
    fontFamily: "Georgia, 'Times New Roman', serif",
    fontSize: 'clamp(1.2rem, 3vw, 1.8rem)',
    lineHeight: '1.8',
    color: '#ffffff',
    letterSpacing: '0.02em',
    margin: 0,
  };

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
        <div className="max-w-[700px] mx-auto">
          {paragraphs.map((para, pIdx) => (
            <div
              key={pIdx}
              style={{ marginBottom: pIdx < paragraphs.length - 1 ? '1.5em' : 0 }}
            >
              {para.lines.map((line, lineIdx) => {
                if (line.type === 'header') {
                  return (
                    <div
                      key={lineIdx}
                      style={{
                        ...baseStyle,
                        fontSize: 'clamp(0.9rem, 2vw, 1.1rem)',
                        fontStyle: 'italic',
                        opacity: 0.5,
                        marginBottom: '0.5em',
                      }}
                    >
                      {line.words.map(renderWord)}
                    </div>
                  );
                }

                if (line.type === 'list-item') {
                  return (
                    <div
                      key={lineIdx}
                      style={{
                        ...baseStyle,
                        paddingLeft: '1.5em',
                        textIndent: '-1.5em',
                      }}
                    >
                      {line.words.map(renderWord)}
                    </div>
                  );
                }

                return (
                  <div key={lineIdx} style={baseStyle}>
                    {line.words.map(renderWord)}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
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
