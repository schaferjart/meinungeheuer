import { useCallback, useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { TtsStatus, WordTimestamp } from '../types.js';
import { parseMarkdownText } from '../utils/markdown.js';
import { useKaraokeReader } from '../hooks/useKaraokeReader.js';
import { useAutoScroll } from '../hooks/useAutoScroll.js';

// ============================================================
// Types
// ============================================================

export interface KaraokeReaderProps {
  /** Markdown text to render with karaoke highlighting. */
  text: string;
  /** Sorted word-level timestamps (by startTime). */
  timestamps: WordTimestamp[];
  /** Audio source -- a URL string or an existing HTMLAudioElement. */
  audioSrc?: string | HTMLAudioElement;
  /** Whether to attempt auto-play when audio is ready. */
  autoPlay?: boolean;
  /** Fires exactly once when playback finishes. */
  onComplete?: () => void;
  /** Fires on every status transition. */
  onStatusChange?: (status: TtsStatus) => void;
  /** Fires when an error occurs. */
  onError?: (error: Error) => void;
  /** Initial volume (0.0 -- 1.0, default 1). */
  initialVolume?: number;
  /** Hide built-in playback controls. */
  hideControls?: boolean;
  /** Top boundary of comfort zone as fraction 0-1 (default: 0.20). */
  scrollComfortTop?: number;
  /** Bottom boundary of comfort zone as fraction 0-1 (default: 0.65). */
  scrollComfortBottom?: number;
  /** Cooldown in ms after manual scroll before auto-scroll resumes (default: 3000). */
  scrollCooldown?: number;
  /** Additional CSS class name(s) for the root element. */
  className?: string;
  /** Inline styles for the root element. */
  style?: CSSProperties;
}

// ============================================================
// Component
// ============================================================

export function KaraokeReader({
  text,
  timestamps,
  audioSrc,
  autoPlay,
  onComplete,
  onStatusChange,
  onError,
  initialVolume,
  hideControls = false,
  scrollComfortTop,
  scrollComfortBottom,
  scrollCooldown,
  className,
  style,
}: KaraokeReaderProps) {
  // -----------------------------------------------------------
  // Compose hooks
  // -----------------------------------------------------------
  const {
    status,
    activeWordIndex,
    toggle,
    volume,
    setVolume,
    error,
  } = useKaraokeReader({
    timestamps,
    audioSrc,
    autoPlay,
    initialVolume,
    onComplete,
    onStatusChange,
    onError,
  });

  // -----------------------------------------------------------
  // Refs for word spans and scroll container
  // -----------------------------------------------------------
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wordElementsRef = useRef<Map<number, HTMLSpanElement>>(new Map());
  const prevActiveRef = useRef(-1);

  // -----------------------------------------------------------
  // Auto-scroll integration
  // -----------------------------------------------------------
  useAutoScroll({
    containerRef,
    activeWordIndex,
    wordElementsRef,
    comfortTop: scrollComfortTop,
    comfortBottom: scrollComfortBottom,
    cooldownMs: scrollCooldown,
    enabled: status === 'playing',
  });

  // -----------------------------------------------------------
  // DOM sync: direct manipulation of data-kr-state (60fps)
  // -----------------------------------------------------------
  useEffect(() => {
    const wordMap = wordElementsRef.current;
    const prevIdx = prevActiveRef.current;

    // Mark previous word as spoken
    if (prevIdx >= 0) {
      const prevEl = wordMap.get(prevIdx);
      if (prevEl) {
        prevEl.setAttribute('data-kr-state', 'spoken');
      }
    }

    // Mark current word as active
    if (activeWordIndex >= 0) {
      const activeEl = wordMap.get(activeWordIndex);
      if (activeEl) {
        activeEl.setAttribute('data-kr-state', 'active');
      }
    }

    prevActiveRef.current = activeWordIndex;
  }, [activeWordIndex]);

  // -----------------------------------------------------------
  // Parse text into structured paragraphs
  // -----------------------------------------------------------
  const paragraphs = parseMarkdownText(text);

  // -----------------------------------------------------------
  // Word ref callback
  // -----------------------------------------------------------
  const wordRefCallback = useCallback(
    (index: number) => (el: HTMLSpanElement | null) => {
      if (el) {
        wordElementsRef.current.set(index, el);
      } else {
        wordElementsRef.current.delete(index);
      }
    },
    [],
  );

  // -----------------------------------------------------------
  // Event handlers
  // -----------------------------------------------------------
  const handleContainerClick = useCallback(() => {
    toggle();
  }, [toggle]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        toggle();
      }
    },
    [toggle],
  );

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setVolume(Number(e.target.value));
    },
    [setVolume],
  );

  // -----------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------
  if (status === 'loading') {
    return (
      <div
        className={`kr-root kr-loading ${className ?? ''}`.trim()}
        style={style}
        data-kr-status={status}
      >
        <div className="kr-loading-indicator" role="status" aria-label="Loading audio">
          Loading...
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------
  // Error state
  // -----------------------------------------------------------
  if (status === 'error') {
    return (
      <div
        className={`kr-root kr-error ${className ?? ''}`.trim()}
        style={style}
        data-kr-status={status}
      >
        <div className="kr-error-fallback" role="alert">
          {error?.message ?? 'An error occurred'}
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------
  // Render
  // -----------------------------------------------------------
  return (
    <div
      className={`kr-root ${className ?? ''}`.trim()}
      style={style}
      data-kr-status={status}
      tabIndex={0}
      role="application"
      onKeyDown={handleKeyDown}
    >
      <div
        className="kr-scroll-container"
        ref={containerRef}
        onClick={handleContainerClick}
      >
        <div className="kr-content">
          {paragraphs.map((para, pIdx) => (
            <div key={pIdx} className="kr-paragraph">
              {para.lines.map((line, lIdx) => {
                const Tag = line.type === 'header' ? 'h2' : 'p';
                return (
                  <Tag
                    key={lIdx}
                    className={`kr-line kr-line--${line.type}`}
                  >
                    {line.words.map((w) => (
                      <span
                        key={w.globalIndex}
                        className={`kr-word${w.strikethrough ? ' kr-word--strikethrough' : ''}`}
                        data-kr-index={w.globalIndex}
                        data-kr-state="upcoming"
                        ref={wordRefCallback(w.globalIndex)}
                      >
                        {w.word}{' '}
                      </span>
                    ))}
                  </Tag>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {!hideControls && (
        <div className="kr-controls">
          <label className="kr-volume-label">
            Volume
            <input
              type="range"
              className="kr-volume-slider"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={handleVolumeChange}
              aria-label="Volume"
            />
          </label>
        </div>
      )}
    </div>
  );
}
