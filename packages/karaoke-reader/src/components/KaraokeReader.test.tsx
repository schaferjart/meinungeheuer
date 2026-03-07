import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KaraokeReader } from './KaraokeReader.js';
import { MockAudio } from '../test-utils/mock-audio.js';
import type { WordTimestamp } from '../types.js';
import { act } from '@testing-library/react';

// ============================================================
// Test data
// ============================================================

const SIMPLE_TEXT = 'Hello world test';

function makeTimestamps(): WordTimestamp[] {
  return [
    { word: 'Hello', startTime: 0.0, endTime: 0.5, index: 0 },
    { word: 'world', startTime: 0.6, endTime: 1.0, index: 1 },
    { word: 'test', startTime: 1.2, endTime: 1.5, index: 2 },
  ];
}

function createReadyAudio(): { audio: HTMLAudioElement; mock: MockAudio } {
  const mock = new MockAudio();
  const audio = mock as unknown as HTMLAudioElement;
  return { audio, mock };
}

// ============================================================
// Tests
// ============================================================

describe('KaraokeReader', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -----------------------------------------------------------
  // 1. Renders word spans with data-kr-index attributes (COMP-01)
  // -----------------------------------------------------------
  it('renders word spans with data-kr-index attributes (COMP-01)', () => {
    const { audio, mock } = createReadyAudio();
    mock.readyState = 4;

    render(
      <KaraokeReader
        text={SIMPLE_TEXT}
        timestamps={makeTimestamps()}
        audioSrc={audio}
      />,
    );

    const wordSpans = document.querySelectorAll('[data-kr-index]');
    expect(wordSpans.length).toBe(3);
    expect(wordSpans[0]!.getAttribute('data-kr-index')).toBe('0');
    expect(wordSpans[1]!.getAttribute('data-kr-index')).toBe('1');
    expect(wordSpans[2]!.getAttribute('data-kr-index')).toBe('2');

    // Check word text content
    expect(wordSpans[0]!.textContent).toContain('Hello');
    expect(wordSpans[1]!.textContent).toContain('world');
    expect(wordSpans[2]!.textContent).toContain('test');
  });

  // -----------------------------------------------------------
  // 2. Sets data-kr-state="active" on current word during playback (COMP-02)
  // -----------------------------------------------------------
  it('sets data-kr-state="active" on current word during mock playback (COMP-02)', async () => {
    const { audio, mock } = createReadyAudio();

    render(
      <KaraokeReader
        text={SIMPLE_TEXT}
        timestamps={makeTimestamps()}
        audioSrc={audio}
      />,
    );

    // Transition to ready
    act(() => {
      mock.simulateCanPlayThrough(5);
    });

    // Start playback via click
    const scrollContainer = document.querySelector('.kr-scroll-container')!;
    await act(async () => {
      fireEvent.click(scrollContainer);
    });

    // Set currentTime and advance rAF tick (useAudioSync uses rAF polling)
    mock.currentTime = 0.3;
    act(() => {
      vi.advanceTimersByTime(16);
    });

    const word0 = document.querySelector('[data-kr-index="0"]')!;
    expect(word0.getAttribute('data-kr-state')).toBe('active');
  });

  // -----------------------------------------------------------
  // 3. Sets data-kr-state="spoken" on words before active word (COMP-02)
  // -----------------------------------------------------------
  it('sets data-kr-state="spoken" on words before active word (COMP-02)', async () => {
    const { audio, mock } = createReadyAudio();

    render(
      <KaraokeReader
        text={SIMPLE_TEXT}
        timestamps={makeTimestamps()}
        audioSrc={audio}
      />,
    );

    act(() => {
      mock.simulateCanPlayThrough(5);
    });

    const scrollContainer = document.querySelector('.kr-scroll-container')!;
    await act(async () => {
      fireEvent.click(scrollContainer);
    });

    // Set currentTime and advance rAF tick -> word 0 active
    mock.currentTime = 0.3;
    act(() => {
      vi.advanceTimersByTime(16);
    });

    // Now advance to 0.7s -> word 1 active, word 0 should become spoken
    mock.currentTime = 0.7;
    act(() => {
      vi.advanceTimersByTime(16);
    });

    const word0 = document.querySelector('[data-kr-index="0"]')!;
    const word1 = document.querySelector('[data-kr-index="1"]')!;
    expect(word0.getAttribute('data-kr-state')).toBe('spoken');
    expect(word1.getAttribute('data-kr-state')).toBe('active');
  });

  // -----------------------------------------------------------
  // 4. Click on text area toggles play/pause (COMP-05)
  // -----------------------------------------------------------
  it('click on text area toggles play/pause (COMP-05)', async () => {
    const { audio, mock } = createReadyAudio();
    const onStatusChange = vi.fn();

    render(
      <KaraokeReader
        text={SIMPLE_TEXT}
        timestamps={makeTimestamps()}
        audioSrc={audio}
        onStatusChange={onStatusChange}
      />,
    );

    act(() => {
      mock.simulateCanPlayThrough(5);
    });

    const scrollContainer = document.querySelector('.kr-scroll-container')!;

    // Click to play
    await act(async () => {
      fireEvent.click(scrollContainer);
    });

    expect(onStatusChange).toHaveBeenCalledWith('playing');

    // Click to pause
    act(() => {
      fireEvent.click(scrollContainer);
    });

    expect(onStatusChange).toHaveBeenCalledWith('paused');
  });

  // -----------------------------------------------------------
  // 5. Space key toggles play/pause (COMP-05)
  // -----------------------------------------------------------
  it('Space key toggles play/pause (COMP-05)', async () => {
    const { audio, mock } = createReadyAudio();
    const onStatusChange = vi.fn();

    render(
      <KaraokeReader
        text={SIMPLE_TEXT}
        timestamps={makeTimestamps()}
        audioSrc={audio}
        onStatusChange={onStatusChange}
      />,
    );

    act(() => {
      mock.simulateCanPlayThrough(5);
    });

    const root = document.querySelector('.kr-root')!;

    // Space to play
    await act(async () => {
      fireEvent.keyDown(root, { key: ' ' });
    });

    expect(onStatusChange).toHaveBeenCalledWith('playing');

    // Space to pause
    act(() => {
      fireEvent.keyDown(root, { key: ' ' });
    });

    expect(onStatusChange).toHaveBeenCalledWith('paused');
  });

  // -----------------------------------------------------------
  // 6. Enter key toggles play/pause (COMP-05)
  // -----------------------------------------------------------
  it('Enter key toggles play/pause (COMP-05)', async () => {
    const { audio, mock } = createReadyAudio();
    const onStatusChange = vi.fn();

    render(
      <KaraokeReader
        text={SIMPLE_TEXT}
        timestamps={makeTimestamps()}
        audioSrc={audio}
        onStatusChange={onStatusChange}
      />,
    );

    act(() => {
      mock.simulateCanPlayThrough(5);
    });

    const root = document.querySelector('.kr-root')!;

    // Enter to play
    await act(async () => {
      fireEvent.keyDown(root, { key: 'Enter' });
    });

    expect(onStatusChange).toHaveBeenCalledWith('playing');
  });

  // -----------------------------------------------------------
  // 7. Volume slider changes volume (COMP-06)
  // -----------------------------------------------------------
  it('volume slider changes volume (COMP-06)', () => {
    const { audio, mock } = createReadyAudio();
    mock.readyState = 4;

    render(
      <KaraokeReader
        text={SIMPLE_TEXT}
        timestamps={makeTimestamps()}
        audioSrc={audio}
      />,
    );

    const slider = document.querySelector('.kr-volume-slider') as HTMLInputElement;
    expect(slider).toBeTruthy();

    act(() => {
      fireEvent.change(slider, { target: { value: '0.5' } });
    });

    expect(mock.volume).toBe(0.5);
  });

  // -----------------------------------------------------------
  // 8. Loading state renders loading indicator (COMP-08)
  // -----------------------------------------------------------
  it('loading state renders loading indicator (COMP-08)', () => {
    const { audio } = createReadyAudio();

    render(
      <KaraokeReader
        text={SIMPLE_TEXT}
        timestamps={makeTimestamps()}
        audioSrc={audio}
      />,
    );

    // Audio starts in loading state (readyState = 0)
    const root = document.querySelector('.kr-root')!;
    expect(root.getAttribute('data-kr-status')).toBe('loading');
    expect(root.classList.contains('kr-loading')).toBe(true);

    const indicator = document.querySelector('.kr-loading-indicator')!;
    expect(indicator).toBeTruthy();
    expect(indicator.getAttribute('role')).toBe('status');
  });

  // -----------------------------------------------------------
  // 9. Error state renders error fallback (COMP-08)
  // -----------------------------------------------------------
  it('error state renders error fallback (COMP-08)', () => {
    const { audio, mock } = createReadyAudio();

    render(
      <KaraokeReader
        text={SIMPLE_TEXT}
        timestamps={makeTimestamps()}
        audioSrc={audio}
      />,
    );

    // Simulate error
    act(() => {
      mock.simulateError();
    });

    const root = document.querySelector('.kr-root')!;
    expect(root.getAttribute('data-kr-status')).toBe('error');
    expect(root.classList.contains('kr-error')).toBe(true);

    const fallback = document.querySelector('.kr-error-fallback')!;
    expect(fallback).toBeTruthy();
    expect(fallback.getAttribute('role')).toBe('alert');
    expect(fallback.textContent).toContain('error');
  });

  // -----------------------------------------------------------
  // 10. Controls hidden when hideControls=true
  // -----------------------------------------------------------
  it('hides controls when hideControls=true', () => {
    const { audio, mock } = createReadyAudio();
    mock.readyState = 4;

    render(
      <KaraokeReader
        text={SIMPLE_TEXT}
        timestamps={makeTimestamps()}
        audioSrc={audio}
        hideControls
      />,
    );

    const controls = document.querySelector('.kr-controls');
    expect(controls).toBeNull();
  });

  // -----------------------------------------------------------
  // 11. className and style props applied to root element
  // -----------------------------------------------------------
  it('applies className and style props to root element', () => {
    const { audio, mock } = createReadyAudio();
    mock.readyState = 4;

    render(
      <KaraokeReader
        text={SIMPLE_TEXT}
        timestamps={makeTimestamps()}
        audioSrc={audio}
        className="my-custom-class"
        style={{ backgroundColor: 'red' }}
      />,
    );

    const root = document.querySelector('.kr-root')!;
    expect(root.classList.contains('my-custom-class')).toBe(true);
    expect((root as HTMLElement).style.backgroundColor).toBe('red');
  });
});
