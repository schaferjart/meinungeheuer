import type { AlignmentData, WordTimestamp } from '../types.js';

/**
 * Convert character-level alignment data into word-level timestamps.
 *
 * Walks through the original text splitting on whitespace boundaries and
 * maps each word to the start time of its first character and the end
 * time of its last character from the alignment data.
 */
export function buildWordTimestamps(
  text: string,
  alignment: AlignmentData,
  timeOffset: number = 0,
): WordTimestamp[] {
  const words: WordTimestamp[] = [];
  const { character_start_times_seconds, character_end_times_seconds } = alignment;

  // Walk through the text identifying word boundaries.
  // A "word" is any contiguous run of non-whitespace characters.
  let charIndex = 0;
  let wordIndex = 0;
  const textLength = text.length;

  while (charIndex < textLength) {
    // Skip whitespace
    while (charIndex < textLength && /\s/.test(text[charIndex] ?? '')) {
      charIndex++;
    }

    if (charIndex >= textLength) break;

    // Collect word characters
    const wordStart = charIndex;
    while (charIndex < textLength && !/\s/.test(text[charIndex] ?? '')) {
      charIndex++;
    }
    const wordEnd = charIndex; // exclusive

    const wordStr = text.slice(wordStart, wordEnd);
    if (wordStr.length === 0) continue;

    // Map to alignment times. The alignment array should have one entry
    // per character in the input text. Guard against mismatches.
    const startCharIdx = wordStart;
    const endCharIdx = wordEnd - 1;

    const startTime = character_start_times_seconds[startCharIdx];
    const endTime = character_end_times_seconds[endCharIdx];

    if (startTime !== undefined && endTime !== undefined) {
      words.push({
        word: wordStr,
        startTime: startTime + timeOffset,
        endTime: endTime + timeOffset,
        index: wordIndex,
      });
    } else {
      // Alignment data shorter than text — use last known times as fallback
      const lastKnownStart =
        character_start_times_seconds[character_start_times_seconds.length - 1] ?? 0;
      const lastKnownEnd =
        character_end_times_seconds[character_end_times_seconds.length - 1] ?? lastKnownStart;
      words.push({
        word: wordStr,
        startTime: lastKnownStart + timeOffset,
        endTime: lastKnownEnd + timeOffset,
        index: wordIndex,
      });
    }

    wordIndex++;
  }

  return words;
}
