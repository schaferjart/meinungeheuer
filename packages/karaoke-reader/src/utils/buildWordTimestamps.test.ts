/**
 * Tests for buildWordTimestamps.
 *
 * Transferred from apps/tablet/src/hooks/useTextToSpeechWithTimestamps.test.ts
 * with import paths updated for the karaoke-reader package.
 */
import { describe, it, expect } from 'vitest';
import { buildWordTimestamps } from './buildWordTimestamps.js';
import type { WordTimestamp } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock alignment from text. Each character gets evenly spaced
 * timestamps at 0.05s intervals.
 */
function mockAlignment(text: string, intervalSeconds: number = 0.05) {
  const characters = text.split('');
  const characterStartTimes: number[] = [];
  const characterEndTimes: number[] = [];

  for (let i = 0; i < characters.length; i++) {
    characterStartTimes.push(i * intervalSeconds);
    characterEndTimes.push((i + 1) * intervalSeconds);
  }

  return {
    characters,
    character_start_times_seconds: characterStartTimes,
    character_end_times_seconds: characterEndTimes,
  };
}

// ---------------------------------------------------------------------------
// buildWordTimestamps
// ---------------------------------------------------------------------------

describe('buildWordTimestamps', () => {
  it('splits basic English text into word timestamps', () => {
    const text = 'hello world';
    const alignment = mockAlignment(text);
    const words = buildWordTimestamps(text, alignment);

    expect(words).toHaveLength(2);

    expect(words[0]?.word).toBe('hello');
    expect(words[0]?.startTime).toBeCloseTo(0.0);
    expect(words[0]?.endTime).toBeCloseTo(0.25); // 5th char ends at 5*0.05

    expect(words[1]?.word).toBe('world');
    expect(words[1]?.startTime).toBeCloseTo(0.30); // 'w' is at index 6
    expect(words[1]?.endTime).toBeCloseTo(0.55); // 'd' at index 10, ends at 11*0.05
  });

  it('handles German text with umlauts', () => {
    const text = 'uber das Ungeheuer';
    const alignment = mockAlignment(text);
    const words = buildWordTimestamps(text, alignment);

    expect(words).toHaveLength(3);
    expect(words[0]?.word).toBe('uber');
    expect(words[1]?.word).toBe('das');
    expect(words[2]?.word).toBe('Ungeheuer');
  });

  it('handles actual German umlauts (multi-character)', () => {
    const text = 'Turoffner fur Gesprache';
    const alignment = mockAlignment(text);
    const words = buildWordTimestamps(text, alignment);

    expect(words).toHaveLength(3);
    expect(words[0]?.word).toBe('Turoffner');
    expect(words[1]?.word).toBe('fur');
    expect(words[2]?.word).toBe('Gesprache');
  });

  it('handles punctuation attached to words', () => {
    const text = 'Hello, world! How are you?';
    const alignment = mockAlignment(text);
    const words = buildWordTimestamps(text, alignment);

    expect(words).toHaveLength(5);
    expect(words[0]?.word).toBe('Hello,');
    expect(words[1]?.word).toBe('world!');
    expect(words[2]?.word).toBe('How');
    expect(words[3]?.word).toBe('are');
    expect(words[4]?.word).toBe('you?');
  });

  it('handles multiple sentences', () => {
    const text = 'First sentence. Second sentence. Third one.';
    const alignment = mockAlignment(text);
    const words = buildWordTimestamps(text, alignment);

    expect(words).toHaveLength(6);
    expect(words[0]?.word).toBe('First');
    expect(words[1]?.word).toBe('sentence.');
    expect(words[2]?.word).toBe('Second');
    expect(words[3]?.word).toBe('sentence.');
    expect(words[4]?.word).toBe('Third');
    expect(words[5]?.word).toBe('one.');
  });

  it('handles a single word', () => {
    const text = 'BIRD';
    const alignment = mockAlignment(text);
    const words = buildWordTimestamps(text, alignment);

    expect(words).toHaveLength(1);
    expect(words[0]?.word).toBe('BIRD');
    expect(words[0]?.startTime).toBeCloseTo(0.0);
    expect(words[0]?.endTime).toBeCloseTo(0.2); // 4 chars * 0.05
    expect(words[0]?.index).toBe(0);
  });

  it('assigns sequential indices', () => {
    const text = 'one two three four';
    const alignment = mockAlignment(text);
    const words = buildWordTimestamps(text, alignment);

    expect(words.map((w) => w.index)).toEqual([0, 1, 2, 3]);
  });

  it('respects time offset parameter', () => {
    const text = 'hello world';
    const alignment = mockAlignment(text);
    const offset = 5.0;
    const words = buildWordTimestamps(text, alignment, offset);

    expect(words[0]?.startTime).toBeCloseTo(5.0);
    expect(words[0]?.endTime).toBeCloseTo(5.25);
    expect(words[1]?.startTime).toBeCloseTo(5.30);
    expect(words[1]?.endTime).toBeCloseTo(5.55);
  });

  it('handles multiple spaces between words', () => {
    const text = 'hello   world';
    const alignment = mockAlignment(text);
    const words = buildWordTimestamps(text, alignment);

    expect(words).toHaveLength(2);
    expect(words[0]?.word).toBe('hello');
    expect(words[1]?.word).toBe('world');
  });

  it('handles leading/trailing whitespace', () => {
    const text = '  hello world  ';
    const alignment = mockAlignment(text);
    const words = buildWordTimestamps(text, alignment);

    expect(words).toHaveLength(2);
    expect(words[0]?.word).toBe('hello');
    expect(words[1]?.word).toBe('world');
  });

  it('handles empty text', () => {
    const alignment = {
      characters: [],
      character_start_times_seconds: [],
      character_end_times_seconds: [],
    };
    const words = buildWordTimestamps('', alignment);
    expect(words).toHaveLength(0);
  });

  it('word start times are strictly before end times', () => {
    const text = 'Vielmehr sollst Du es ihm selber allererst erzahlen.';
    const alignment = mockAlignment(text);
    const words = buildWordTimestamps(text, alignment);

    for (const word of words) {
      expect(word.endTime).toBeGreaterThan(word.startTime);
    }
  });

  it('words are in chronological order', () => {
    const text = 'alpha beta gamma delta';
    const alignment = mockAlignment(text);
    const words = buildWordTimestamps(text, alignment);

    for (let i = 1; i < words.length; i++) {
      const prev = words[i - 1];
      const curr = words[i];
      if (prev && curr) {
        expect(curr.startTime).toBeGreaterThanOrEqual(prev.endTime);
      }
    }
  });
});
